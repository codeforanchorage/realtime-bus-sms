const watson = require('watson-developer-cloud')
      logger = require('../lib/logger'),
      config = require('../lib/config'),
      lib = require('../lib/bustracker'),
      geocode = require('../lib/geocode'),
      emojiRegex = require('emoji-regex'),
      fs = require('fs'),
      twilioClient = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN),
      pug = require('pug')

      // Facebook requirements
const request = require('request');
      https = require('https');

/*

    MIDDLEWARE FUNCTIONS
    These are primarily concerned with parsing the input the comes in from the POST
    body and deciding how to handle it.
    To help logging these set res.locals.action to one of
    '[Failed?]Stop Lookup' '[Failed?]Address Lookup', 'Empty Input', 'About', 'Feedback'

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

function checkServiceExceptions(req, res, next){
    if (lib.serviceExceptions()){
           res.locals.message = {name: "Holiday", message:'There is no bus service today.'}
           return res.render('message')
        }
    next()
}

function addLinkToRequest(req,res, next){
    // Twilio sms messages over 160 characters are split into
    // (and charged as) smaller messages of 153 characters each.
    // So we include the text + message if it won't push over 160 characters
    // or if greater  it won't push over a multiple of 153

    var single_message_limit = 160
    var segment_length = 153

    // the url with 'http://' results in a simple link on iPhones
    // With 'http://' iphone users will see a big box that says 'tap to preview'
    // Simple text seems more in the spirit
    var message = "\n\More features on the smart phone version: bit.ly/AncBus"

    //hikack the render function
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

function aboutResponder(req, res, next){
    let message = req.body.Body;
    if (['about','hi','hello'].indexOf(message.trim().toLowerCase()) >= 0) {
        res.locals.action = 'About';
        return res.render('about-partial');
    }
    next();
}

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
function addressResponder(req, res, next){
    var input = req.body.Body;
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
        if (err.type == 'NOT_FOUND') return next() // Address not found pass to Watson

        res.locals.action = 'Failed Address Lookup'
        res.render('message', {message: err})
    })
}

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



/*
    WATSON MIDDLE WARE
    TODO Test intent confidence to decide to help decide flow
*/
function askWatson(req, res, next){
    var input = req.body.Body.replace(/['"]+/g, ''); // Watson number parser take m for million so things like "I'm" returns an unwanted number

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

    var context  = JSON.parse(req.cookies['context'] || '{}');

    conversation.message( {
        workspace_id: config.WATSON_WORKPLACE,
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
                // But a query like "I'm at stop 36" should end up here
                // Watson should identify the number for use as an entity
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
                // The geocoder has already tried and failed to lookup
                // but Watson thinks this is an address. It's only a seperate
                // case so we can log a failed address lookup
                res.locals.action = 'Failed Address Lookup'
                res.locals.message = {message:response.output.text.join(' ')}
                return res.render('message')
            } else {
                // For everything else .
                res.locals.action = 'Watson Chat'
                res.locals.message = {message:response.output.text.join(' ')}
                return res.render('message')
            }
    });
}


module.exports = {
    askWatson: askWatson,
    sanitizeInput: sanitizeInput,
    blankInputRepsonder: blankInputRepsonder,
    addLinkToRequest: addLinkToRequest,
    checkServiceExceptions: checkServiceExceptions,
    aboutResponder:aboutResponder,
    stopNumberResponder:stopNumberResponder,
    addressResponder:addressResponder,
    findbyLatLon: findbyLatLon,
}