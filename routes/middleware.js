'use strict';

//const watson       = require('watson-developer-cloud')
const AssistantV2 = require('ibm-watson/assistant/v2');
const { IamAuthenticator } = require('ibm-watson/auth');

const logger       = require('../lib/logger')
const config       = require('../lib/config')
const lib          = require('../lib/bustracker')
const gtfs         = require('../lib/gtfs')
const geocode      = require('../lib/geocode')
const emojiRegex   = require('emoji-regex')
const fs           = require('fs')
const twilioClient = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
const pug          = require('pug');

/* Facebook requirements */
const request = require('request')
    , https   = require('https');

/**
 * Middelware Functions for bus app
 * These are primarily concerned with parsing the input the comes in from the POST body and deciding how to handle it
 * To help logging these set res.locals.action to one of:
 * - '[Failed?]Stop Lookup'
 * - '[Failed?]Address Lookup'
 * - 'Empty Input'
 * - 'About'
 * - 'Feedback'
 *
 * @module routes/middleware
 */

/**
 * Strips everything after the first line and removes emojis
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function sanitizeInput(req, res, next) {
    if (req.body.Body) {
        req.body.Body = String(req.body.Body)
        // Split on newline type characters and replace tabs with spaces
        const firstLine = req.body.Body.split(/\r\n|\r|\n/, 1)[0].replace(/\t+/g, " ");
        const emoRegex = emojiRegex();
        req.body.Body = firstLine.replace(emoRegex, '');
    }
    next();
}

/**
 * Checks for holidays. When buses are not running
 * the app only delivers the message.
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function checkServiceExceptions(req, res, next){
    if (gtfs.serviceExceptions()){
           res.locals.message = {name: "Holiday", message:'There is no bus service today.'}
           return res.render('message')
        }
    next()
}

/**
 * Adds a link to the final response suggesting the web version.
 * Twilio sms messages over 160 characters are split into
 * (and charged as) smaller messages of 153 characters each.
 * This includes the text + message if it won't push over 160 characters
 * or if it's greater and it won't push over a multiple of 153
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function addLinkToRequest(req,res, next){
    const single_message_limit = 160
    const segment_length = 153

    // the url with 'http://' results in a simple link on iPhones
    // With 'http://' iphone users will see a big box that says 'tap to preview'
    // Simple text seems more in the spirit
    const message = "\n\More features on the smart phone version: bit.ly/AncBus"

    // Hikack the render function
    var _render = res.render
    res.render = function(view, options, callback) {
        _render.call(this, view, options, (err, text) => {
            if (err) return next(err)

            if ( text.length + message.length <= single_message_limit ) {
                res.send(text + message)
            } else if ( text.length > single_message_limit
                        && text.length % segment_length + message.length <= segment_length ) {
                res.send(text + message)
            } else res.send(text)
        })
    }
    next()
}

/**
 * Respond to blank messages.
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function blankInputRepsonder(req, res, next){
    let input = req.body.Body;
    if (!input || /^\s*$/.test(input)) {
        // res.locals.action is caching the event type which we can use later when logging anlytics
        res.locals.action = 'Empty Input'
        res.locals.message = {name: "No input!", message:'Please send a stop number, intersection, or street address to get bus times.'}
        return res.render('message');
    }
    next();
}

/**
 * Responds with about page to any of the activationWords
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function aboutResponder(req, res, next){
    let message = req.body.Body;
    const activationWords = ['about','hi','hello']
    if (activationWords.indexOf(message.trim().toLowerCase()) >= 0) {
        res.locals.action = 'About';
        return res.render('about-partial');
    }
    next();
}

/**
 * Responds to requests that look like stop numbers.
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function stopNumberResponder(req,res, next){
    let input = req.body.Body;
    let stopRequest = input.toLowerCase().replace(/\s*/g,'').replace("stop",'').replace("#",'');
    if (/^\d+$/.test(stopRequest)) {

        res.locals.action = 'Stop Lookup';
        return lib.getStopFromStopNumber(parseInt(stopRequest))
        .then((routeObject) => {
            res.locals.routes = routeObject;
            res.render('stop-list');
        })
        .catch((err) => {
            res.locals.action = 'Failed Stop Lookup'
            res.render('message', {message: err})
        })
    }
    next()
}

/**
 * Respond to requests from browser with location services
 * with a list of nearby stops.
 * The front end will send lat/lon coordinates wit the query.
 *
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function findbyLatLon(req, res, next) {
    res.locals.returnHTML = 1;

    if (!req.query.lat || !req.query.lon){
        return res.render('message', {message: {message: "Can't determine your location"}});
    }
    var data = geocode.findNearestStops(req.query.lat, req.query.lon);
    if (!data || data.length == 0){
        return res.render('message', {message: {message: "No stops found near you"}});
    }
    res.render('route-list-partial', {routes: {data: {stops: data}} });
}

/**
 * Watson Conversation Middleware
 * This provides an interface to IBM Watson's conversation service.
 * It uses a trained machine learning model to determine user intent from their message.
 * For more information see:  https://www.ibm.com/watson/services/conversation/
 *
 * A trained watson model hosted on IBM bluemix is required to use this.
 * Credentials for bluemix will need to be added to the config.js
 * A model can be created using the file /watson-workspace.json
 *
 * This Watson model will return an context object with an action property that
 * we can use to determine if we need to take further action. For example,
 * when Watson determines the user's intent is to locate stops near a location
 * the context.action = 'Address Lookup'
 *
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
async function askWatson(req, res, next){
    // Watson number parser take m for million so things like 
    // "I'm" returns an unwanted number
    const input = req.body.Body.replace(/['"]+/g, ''); 

    let response;
    let conversation = new AssistantV2({
        version: '2019-02-28',
        authenticator: new IamAuthenticator({
            apikey: config.WATSON_API_KEY,
        }),
        url: "https://api.us-south.assistant.watson.cloud.ibm.com"
    })

    // Saving the sessionID in a cookie and passing it back allows the conversation
    // to maintain state between requests.
    let sessionId  = req.cookies['watsonSessionId'] && req.cookies['watsonSessionId'];
    // Watson Assistant Sesssion
    if (!sessionId){
        try {
            let session = await conversation.createSession(
                {assistantId: config.WATSON_ASSISTANT_ID}
            )           
            sessionId = session.result.session_id
        } catch (err){
            logger.error(err)
            res.locals.message = {message: `I'm sorry I'm having trouble answering questions right now.`}
            return res.render('message')
        }
    }

    // Send and receive message
    try {
        response = await conversation.message( {
            assistantId: config.WATSON_ASSISTANT_ID,
            input: {
                'text': input, 
                'options': {
                    'return_context': true
                }
            },
            sessionId: sessionId,
            return_context: true
        })
        if (response.status !== 200) 
            throw new Error(`Watson returned a status code of ${response.status} ${response.statusText}`)
    } catch (err) {
        let error_data = { input: input }
        if (!(err instanceof Error)) {
            error_data.passed = err
            err = new Error('Watson error')
        }
        logger.error(err, error_data);
        res.locals.message = {message: `A search for ${req.body.Body} found no results. For information about using this service send "About".`}
        return res.render('message')
    }

    if (!response.result ||  !response.result.context) {
        // this should never happen
        logger.error("Watson returned an unusable response.", {response: response})
        res.locals.message = {name: "Bustracker Error", message: "I'm sorry an error occured." }
        return res.render('message')
    }

    let context = response.result.context
    let watsonOutput = response.result.output

    // Set cookie to value of returned conversation_id will allow
    // continuation of conversations that are otherwise stateless
    res.cookie('watsonSessionId', sessionId, { maxAge: 5* 60 * 1000 }) // watson sessions only last five minutes 

    // The context.action is set in the Watson Conversation Nodes when we know
    // we need to respond with additional data or our own message.
    // If it's not set, we use the response sent from Watson.

    let action = context.skills['main skill'].user_defined['action']

    if (!action) {
        res.locals.action = 'Watson Chat'
        let text = watsonOutput.generic
         .filter(t => t.response_type === 'text')
         .map(t => t.text)
        res.locals.message = {message:text.join(' ')}
        return res.render('message')
    }
    if(action === "Stop Lookup"){
        // Earlier middleware should catch plain stop numbers
        // But a query like "I'm at stop 36" will end up here
        // Watson should identify the number for us as an entity
        var stops = watsonOutput.entities.filter((element) =>  element['entity'] == "sys-number"  );

        // It's possible to have more than one number in a user query
        // If that happens we take the first number and hope it's right
        var stop = stops[0]

        if (stop) {
            res.locals.action = 'Stop Lookup'
            lib.getStopFromStopNumber(parseInt(stops[0].value))
            .then(routeObject => {
                res.locals.routes = routeObject;
                res.render('stop-list');
            })
            .catch((err) => {
                res.locals.action = 'Failed Stop Lookup'
                res.render('message', {message: err})
            })

        } else {
            // This shouldn't ever happen.
            res.locals.action = 'Watson Error'
            logger.error("Watson returned a next_bus intent with no stops.", {input: input})
            res.locals.message = {name: "Bustracker Error", message:"I'm sorry an error occured." }
            return res.render('message')
        }
    } else if (action === "Address Lookup"){
        // Watson has determined the user is looking for an address
        // send the request to google places and see what we get.
        next()
    } else if (action === "Known Place"){
        // Watson thinks the user is looking for a known place entity
        // Set the location to the known place's canonical name
        // and send to google geocoder
        res.locals.known_location = watsonOutput.entities.find((element) =>  element['entity'] == "anchorage-location"  );
        next()
    } 
    else {
        // For everything else.
        res.locals.action = 'Watson Chat'
        res.locals.message = {message:response.output.text.join(' ')}
        return res.render('message')
    } 
}


/**
 * Midddleware that responsds to user requests for stops near a location.

 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function addressResponder(req, res, next){
    const known_location = res.locals.known_location
    const input = known_location ? known_location.value : req.body.Body;
    res.locals.action = 'Address Lookup'
    return geocode.stops_near_location(input)
    .then((routeObject) => {
        if (routeObject.data.stops.length < 1) { // Address found, but no stops near address
            res.locals.message = { name: "No Stops", message: `Sorry, no stops were found within ${config.NEAREST_BUFFER} mile` + ((config.NEAREST_BUFFER != 1) ? 's' : '' + '.')}
            return res.render('message')
        }
        res.locals.routes = routeObject;
        res.render('route-list');
    })
    .catch((err) => {
        res.locals.action = 'Failed Address Lookup'

        if (err.type == 'NOT_FOUND') {
            res.locals.message = {name: "Not Found", message: `My search for address ${input} returned zero results. You can enter a street address like '632 West 6th' or an intersection such as '6th and G street'.`}
            res.render('message')
        } else {
            logger.error(err)
            res.locals.message = {name: "Geocoder Error", message: `I'm sorry there was an error searching for that address`}
            res.render('message')
        }
    })
}


module.exports = {
    askWatson: askWatson,
    sanitizeInput: sanitizeInput,
    blankInputRepsonder: blankInputRepsonder,
    addLinkToRequest: addLinkToRequest,
    checkServiceExceptions: checkServiceExceptions,
    aboutResponder: aboutResponder,
    stopNumberResponder: stopNumberResponder,
    addressResponder: addressResponder,
    findbyLatLon: findbyLatLon,
}
