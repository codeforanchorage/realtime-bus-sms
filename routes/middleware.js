const watson = require('watson-developer-cloud')
      logger = require('../lib/logger'),
      config = require('../lib/config'),
      lib = require('../lib/bustracker'),
      geocode = require('../lib/geocode'),
      emojiRegex = require('emoji-regex');

      // Facebook requirements
const request = require('request');
      https = require('https');

/*

 MIDDLEWARE FUNCTIONS
 These are primarily concerned with parsing the input the comes in from the POST
 body and deciding how to handle it.
 To help logging this sets res.locals.action to one of
 '[Failed?]Stop Lookup' '[Failed?]Address Lookup', 'Empty Input', 'About', 'Feedback'

 */
function sanitizeInput(req, res, next) {
    // Removes everything after first return/carriage-return.
    // Strip emojis

    if (req.body.Body) {
        // Split on newline type characters and replace tabs with spaces
        var firstLine = req.body.Body.split(/\r\n|\r|\n/, 1)[0].replace(/\t+/g, " ");
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

function blankInputRepsonder(req, res, next){
    var input = req.body.Body;
    if (!input || /^\s*$/.test(input)) {
        // res.locals.action is caching the event type which we can use later when logging anlytics
        res.locals.action = 'Empty Input'
        res.locals.message = {name: "No input!", message:'Please send a stop number, intersection, or street address to get bus times.'}
        return res.render('message');
    }
    next();
}

function aboutResponder(req, res, next){
    var message = req.body.Body;
    if (['about','hi','hello'].indexOf(message.trim().toLowerCase()) >= 0) {
        res.locals.action = 'About';
        return res.render('about-partial');
    }
    next();
}

function stopNumberResponder(req,res, next){
    var input = req.body.Body;
    var stopRequest = input.toLowerCase().replace(/\s*/g,'').replace("stop",'').replace("#",'');
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

function send_feedback(req, res) {
    res.locals.returnHTML = 1
    res.locals.action = 'Feedback'
    return lib.processFeedback(req)
    .then(() => res.render('message', {message: {message:'Thanks for the feedback'}}))
    .catch((err)=>{
        res.render('message', {message: {message:'Error saving feedback, administrator notified'}})
        logger.error(err)
    });
}
function feedbackResponder(req, res, next){
    res.set('Content-Type', 'text/plain');
    var message = req.body.Body || '';
    if (message.substring(0, config.FEEDBACK_TRIGGER.length).toUpperCase() == config.FEEDBACK_TRIGGER.toUpperCase()) {
        res.locals.action = 'Feedback'
        return lib.processFeedback(message.substring(config.FEEDBACK_TRIGGER.length), req)
        .then((data)=>res.send("Thanks for the feedback"))
        .catch((err)=>{
            res.send("Error saving feedback, administrator notified.");
            logger.error(err)
        });
    }
    next();
}
function respondto_feedback(req, res, next) {
    var comments = JSON.parse(fs.readFileSync('./comments.json'));
    for(var i=comments.comments.length-1; i >= 0; i--) {
        if (comments.comments[i].response_hash && (comments.comments[i].response_hash == req.query.hash)) {
            if (comments.comments[i].phone) {
                return res.render("respond", {pageData: {hash: comments.comments[i].response_hash, feedback: comments.comments[i].feedback, phone: comments.comments[i].phone}});
            }
        }
    }
    res.sendStatus(404);    // Simulate page not found
}


/*
    WATSON MIDDLE WARE
    TODO Test intent confidence to decide to help decide flow
*/
function askWatson(req, res, next){
    logger.debug("Calling Watson")
    var input = req.body.Body.replace(/['"]+/g, ''); // Watson number parser take m for million so things like "I'm" returns an unwanted number

    try {
        // conversation() will just throw an error if credentials are missing
        var conversation = watson.conversation({
            username: config.WATSON_USER,
            password: config.WATSON_PASSWORD,
            version: 'v1',
            version_date: '2016-09-20'
        })
    } catch(err) {
        logger.error(err, {input: input});
        res.locals.message = {message: `A search for ${req.body.Body} found no results. For information about using this service send "About".`}
        return res.render('message')
    }

    /* TODO - this is probably not the best way to do maintain state
        If we want to be able to have conversation beyond a stateless
        question & answer, we need to be able to pass the context that Watson sends
        back to Watson. The context object isn't very big, so it fits within the 4k limit
        on cookies imposed by browsers, but this might be fragile.
        A more solid approach might be to use sessions and store the context with a session id.
        But for right now th cookie approach is working.
    */
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

            switch(response.context.action) {
                case "Stop Lookup":
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
                        return;
                    } else {
                        // This shouldn't ever happen.
                        res.locals.action = 'Watson Error'
                        logger.error("Watson returned a next_bus intent with no stops.", {input: input})
                        res.locals.message = {name: "Bustracker Error", message:"I'm sorry an error occured." }
                        return res.render('message')
                    }
                case("Address Lookup"):
                    // The geocoder has already tried and failed to lookup
                    // but Watson thinks this is an address. It's only a seperate
                    // case so we can log a failed address lookup
                    res.locals.action = 'Failed Address Lookup'
                    res.locals.message = {message:response.output.text.join(' ')}
                    return res.render('message')

                default:
                    // For everything else .
                    res.locals.action = 'Watson Chat'
                    res.locals.message = {message:response.output.text.join(' ')}
                    return res.render('message')

            }
        next();
    });
}

/*

 Facebook Hooks
 GET is to do the initial app validation in the Facebook Page setup.
 POST is the actual Facebook message handling

 */
function facebook_verify(req, res) {
    if (req.query['hub.mode'] === 'subscribe' &&
        req.query['hub.verify_token'] === config.FB_VALIDATION_TOKEN) {
        logger.info("Validating webhook");
        res.status(200).send(req.query['hub.challenge']);
    } else {
        logger.warn("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
}

function facebook_update(req, res) {
    var data = req.body;

    // Make sure this is a page subscription
    if (data.object == 'page') {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function(pageEntry) {
            var pageID = pageEntry.id;
            var timeOfEvent = pageEntry.time;
            console.log("messaging: ", pageEntry.messaging)
            // Iterate over each messaging event
            pageEntry.messaging.forEach(function(messagingEvent) {
                if (messagingEvent.message) {
                    //var reqClone = Object.assign({}, req);  // Need copies for each handled message
                    //var resClone = Object.assign({}, res);
                    //receivedFBMessage(req, res, messagingEvent);
                    req.runMiddleware('/', {
                        method:'post',
                        body: {Body: messagingEvent.message.text,
                               From: messagingEvent.sender.id,
                               isFB: true}
                    },function(code, data, headers){
                        //data has response from express
                        sendFBMessage(messagingEvent.sender.id, data)
                    })
                } else {
                    logger.warn("fbhook received unknown messagingEvent: ", JSON.stringify(messagingEvent));
                }
            });
        });

        // Assume all went well.
        //
        // You must send back a 200, within 20 seconds, to let us know you've
        // successfully received the callback. Otherwise, the request will time out.
        res.sendStatus(200);
    }
}

function sendFBMessage(recipientId, messageText) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: messageText,
            metadata: "DEVELOPER_DEFINED_METADATA"
        }
    };
    //console.log("Trying to send message \"%s\" to recipient %s", messageText, recipientId );

    request({
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: { access_token: config.FB_PAGE_ACCESS_TOKEN },
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        if (error || (response.statusCode != 200)) {
            if (error) {
                logger.error("Failed calling Send API: " + error.message);
            }
            if (response) {
                logger.error("Failed calling Send API: " + response.statusCode + " - " + response.statusMessage);
            }
        }
    });

}
module.exports = {
    askWatson: askWatson,
    sanitizeInput: sanitizeInput,
    blankInputRepsonder: blankInputRepsonder,
    checkServiceExceptions: checkServiceExceptions,
    aboutResponder:aboutResponder,
    stopNumberResponder:stopNumberResponder,
    addressResponder:addressResponder,
    findbyLatLon: findbyLatLon,
    facebook_verify:facebook_verify,
    facebook_update:facebook_update,
    feedbackResponder:feedbackResponder,
    send_feedback:send_feedback,
    respondto_feedback:respondto_feedback
}