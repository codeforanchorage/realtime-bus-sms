'use strict';

const watson       = require('watson-developer-cloud')
const logger       = require('../lib/logger')
const config       = require('../lib/config')
const lib          = require('../lib/bustracker')
const gtfs         = require('../lib/gtfs')
const geocode      = require('../lib/geocode')
const emojiRegex   = require('emoji-regex')
const fs           = require('fs')
const twilioClient = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
const pug          = require('pug');
const electricBus  = require('../lib/electric_bus')

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
 * Respond to requests from browser for electic bus location
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */

function findElecticBus(req, res, next) {
    res.locals.action = 'Electric Bus'
    electricBus.getLatestBusInfo(function(error, data) {
        if (error) {res.send(error)}
        res.render('electric-bus', {data: data})
    })
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
function askWatson(req, res, next){
    const input = req.body.Body.replace(/['"]+/g, ''); // Watson number parser take m for million so things like "I'm" returns an unwanted number
    try {
        // conversation() will just throw an error if credentials are missing
        var conversation = watson.conversation({
            username: config.WATSON_USER,
            password: config.WATSON_PASSWORD,
            version: 'v1',
            version_date: '2017-05-26'
        })
    } catch(err) {
        logger.error(err, {input: input});
        res.locals.message = {message: `A search for ${req.body.Body} found no results. For information about using this service send "About".`}
        return res.render('message')
    }

    const context  = JSON.parse(req.cookies['context'] || '{}');

    conversation.message( {
        workspace_id: config.WATSON_WORKPLACE_ID,
        input: {'text': input},
        context: context
        }, function(err, response) {
            if (err) {
                let error_data = { input: input }
                if (!(err instanceof Error)) {
                    error_data.passed = err
                    err = new Error('Watson error')
                }
                logger.error(err, error_data);
                // At this point we know the request isn't a bus number or address. If Watson sends an error fall back to older behavior.
                res.locals.message = {message: `A search for ${req.body.Body} found no results. For information about using this service send "About".`}
                return res.render('message')
            }

            if (!response.context) {
                // this should never happen
                logger.error("Watson returned an unusable response.", {response: response})
                res.locals.message = {name: "Bustracker Error", message:"I'm sorry an error occured." }
                return res.render('message')
            }
            // Set cookie to value of returned conversation_id will allow
            // continuation of conversations that are otherwise stateless
            res.cookie('context', JSON.stringify(response.context))

            // The context.action is set in the Watson Conversation Nodes when we know
            // we need to respond with additional data or our own message.
            // If it's not set, we use the response sent from Watson.

            if (!response.context.action) {
                res.locals.action = 'Watson Chat'
                res.locals.message = {message:response.output.text.join(' ')}
                return res.render('message')
            }


            if(response.context.action === "Stop Lookup"){
                // Earlier middleware should catch plain stop numbers
                // But a query like "I'm at stop 36" will end up here
                // Watson should identify the number for us as an entity
                var stops = response.entities.filter((element) =>  element['entity'] == "sys-number"  );

                // It's possible to have more than one number in a user query
                // If that happens we take the first number and hope it's right
                var stop = stops[0]
                if (stop) {
                    res.locals.action = 'Stop Lookup'
                    lib.getStopFromStopNumber(parseInt(stops[0].value))
                    .then((routeObject) => {
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
            } else if (response.context.action === "Address Lookup"){
                // Watson has determined the user is looking for an address
                // send the request to google places and see what we get.

                // Certain frequently-used locations are hard coded into our Watson model
                // If the user search for one of these it will be saved in know_location
                // and passed to geocoder.
                res.locals.known_location = response.entities.filter((element) =>  element['entity'] == "anchorage-location"  );
                next()
            } else {
                // For everything else.
                res.locals.action = 'Watson Chat'
                res.locals.message = {message:response.output.text.join(' ')}
                return res.render('message')
            }
    });
}

/**
 * Midddleware that responsds to user requests for stops near a location.

 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function addressResponder(req, res, next){
    const known_location = res.locals.known_location
    const input = (known_location && known_location.length > 0) ? known_location[0].value : req.body.Body;
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
    findElecticBus: findElecticBus,
    findbyLatLon: findbyLatLon,
}