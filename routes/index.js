var express = require('express');
var router = express.Router();
var debug = require('debug')('routes/index.js');
var lib = require('../lib/index');
var config = require('../lib/config');
var fs = require('fs');

var twilioClient = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
var logger = require('../lib/logger');
var lowdb_log = require('../lib/lowdb_log_transport');
// Facebook requirements
var request = require('request');
var https = require('https');

var watson = require('watson-developer-cloud');

/* 
    WATSON MIDDLE WARE 
    TODO Test intent confidence to decide to help decide flow
*/
function askWatson(req, res, next){
    logger.debug("Calling Watson")
    var input = req.body.Body.replace(/['"]+/g, ''); // Watson number parser take m for million so things like "I'm" returns an unwanted number

    try {
        // conversation() will just throw and error if credentials are missing
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
                logger.error(err, {input: input});
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

 MIDDLEWARE FUNCTIONS
 These are primarily concerned with parsing the input the comes in from the POST
 body and deciding how to handle it.
 To help logging this sets res.locals.action to one of
 '[Failed?]Stop Lookup' '[Failed?]Address Lookup', 'Empty Input', 'About', 'Feedback'

 */

function feedbackResponder(req, res, next){
        res.set('Content-Type', 'text/plain');
        var message = req.body.Body || '';
        if (message.substring(0, config.FEEDBACK_TRIGGER.length).toUpperCase() == config.FEEDBACK_TRIGGER.toUpperCase()) {
            res.locals.action = 'Feedback'
            lib.processFeedback(message.substring(config.FEEDBACK_TRIGGER.length), req)
            .then((data)=>res.send("Thanks for the feedback"))
            .catch((err)=>{
                res.send("Error saving feedback, administrator notified.");
                logger.error(err)
            });
            return;
        }
        next();
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

function checkServiceExceptions(req, res, next){
    if (lib.serviceExceptions()){
           res.locals.message = {name: "Holiday", message:'There is no bus service today.'} 
           return res.render('message')
        }
    next()
}

function aboutResponder(req, res, next){
    var message = req.body.Body;
    if (['about','hi','hello'].indexOf(message.trim().toLowerCase()) >= 0) {
        res.locals.action = 'About';
        res.render('about-partial');
        return;
    }
    next();
}

function stopNumberResponder(req,res, next){
    var input = req.body.Body;
    var stopRequest = input.toLowerCase().replace(/ /g,'').replace("stop",'').replace("#",'');
    if (/^\d+$/.test(stopRequest)) {
        res.locals.action = 'Stop Lookup';
        lib.getStopFromStopNumber(parseInt(stopRequest))

        .then((routeObject) => {
            res.locals.routes = routeObject;
            res.render('stop-list');
        })
        .catch((err) => {
            res.locals.action = 'Failed Stop Lookup'
            res.render('message', {message: err})
        })
        return;
    }
    next()
}

function addressResponder(req, res, next){
    var input = req.body.Body;    
    res.locals.action = 'Address Lookup'
    lib.getStopsFromAddress(input)
    .then((routeObject) => {
        if (routeObject.data.stops.length < 1) { // Address found, but no stops near address
            res.locals.message = { name: "No Stops", message: `Sorry, no stops were found within ${config.NEAREST_BUFFER} mile` + ((config.NEAREST_BUFFER != 1) ? 's' : '' + '.')}
            res.render('message')
            return
        }
        res.locals.routes = routeObject;
        res.render('route-list');
    })
    .catch((err) => {
        if (err.type == 'NOT_FOUND') return next() // Address not found pass to Watson      
 
        res.locals.action = 'Failed Address Lookup'
        res.render('message', {message: err})
    })
    return;  
}

/* GET HOME PAGE */
router.get('/', function(req, res, next) {
        res.render('index');
    }
);

/*

 Facebook Hooks
 GET is to do the initial app validation in the Facebook Page setup.
 POST is the actual Facebook message handling

 */
router.get('/fbhook', function(req, res) {
    if (req.query['hub.mode'] === 'subscribe' &&
        req.query['hub.verify_token'] === config.FB_VALIDATION_TOKEN) {
        logger.info("Validating webhook");
        res.status(200).send(req.query['hub.challenge']);
    } else {
        logger.warn("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
});

router.post('/fbhook', function (req, res) {
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
});




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
            logger.error("Failed calling Send API: ", error.message);
            logger.error("Failed calling Send API", response.statusCode, response.statusMessage);
        }
    });

}



/*  
 TWILIO ENDPOINT
 The user's text message is
 in the POST body.
 TODO: better error messages
 */
router.post('/',
    feedbackResponder,
    checkServiceExceptions,
    blankInputRepsonder,
    aboutResponder,
    stopNumberResponder,
    addressResponder,
    askWatson
);

/* BROWSER AJAX ENDPOINT */
router.post('/ajax',
    function (req, res, next) {
        res.locals.returnHTML = 1;
        next()
    },
    checkServiceExceptions,
    blankInputRepsonder,
    aboutResponder,
    stopNumberResponder,
    addressResponder,
    askWatson
);


/*  DIRECT URL ACCESS
 Routes to allow deep linking and bookmarks via url with
 either address, stop number, or about.
 */
router.get('/find/about', function(req, res, next) {
    res.locals.returnHTML = 1;
    res.locals.action = "About"
    res.render('index');

});

//  :query should be a stop number  
router.get('/find/:query(\\d+)', function(req, res, next) {
        req.body.Body = req.params.query;
        res.locals.returnHTML = 1;
        res.locals.renderWholePage = 1;
        next();
    },
    checkServiceExceptions,
    stopNumberResponder
);

// :query should be everything other than a stop number
// - assumes address search 
router.get('/find/:query', function(req, res, next) {
        req.body.Body = req.params.query;
        res.locals.returnHTML = 1;
        res.locals.renderWholePage = 1;
        next();
    },
    checkServiceExceptions,
    blankInputRepsonder,
    aboutResponder,
    addressResponder,
    askWatson
);

//  a browser with location service enabled can hit this
router.get('/byLatLon', function(req, res, next) {
    res.locals.returnHTML = 1;

    if (lib.serviceExceptions()) {
        res.locals.error = {message:'No Service - Holiday'};
        res.render('message')
        return;
    }
    if (!req.query.lat || !req.query.lon){
        res.render('message', {message: {message: "Can't determine your location"}});
        return;
    }
    var data = lib.findNearestStops(req.query.lat, req.query.lon);
    if (!data || data.length == 0){
        res.render('message', {message: {message: "No routes found near you"}});
        return;
    }
    var data = lib.findNearestStops(req.query.lat, req.query.lon);

    res.render('route-list-partial', {routes: {data: {stops: data}} });


});


// feedback form endpoint
router.post('/feedback', function(req, res) {
    res.locals.returnHTML = 1
    res.locals.action = 'Feedback'
    lib.processFeedback(req.body.comment, req)
    .then()
    .catch((err)=> logger.error(err)); // TODO - tell users if there is a problem or fail silently?
    res.render('message', {message: {message:'Thanks for the feedback'}});
});

//  Respond to feedback over SMS
router.get('/respond', function(req, res, next) {
    var comments = JSON.parse(fs.readFileSync('./comments.json'));
    for(var i=comments.comments.length-1; i >= 0; i--) {
        if (comments.comments[i].response_hash && (comments.comments[i].response_hash == req.query.hash)) {
            if (comments.comments[i].phone) {
                res.render("respond", {pageData: {hash: comments.comments[i].response_hash, feedback: comments.comments[i].feedback, phone: comments.comments[i].phone}});
                return
            }
        }
    }
    res.sendStatus(404);    // Simulate page not found
});

router.post('/respond', function(req, res, next) {
    var comments = JSON.parse(fs.readFileSync('./comments.json'));
    var foundIt = false;
    for(var i=comments.comments.length-1; i >= 0 && !foundIt; i--) {
        if (comments.comments[i].response_hash && (comments.comments[i].response_hash == req.body.hash)) {
            if (comments.comments[i].phone) {
                foundIt = true;
                if (req.body.response) {
                    twilioClient.messages.create({
                            to: comments.comments[i].phone,
                            from: config.MY_PHONE,
                            body: req.body.response }, function(err, message) {
                            if (!err) {
                                var entry = {
                                    response: req.body.response,
                                    to_phone: comments.comments[i].phone
                                };
                                res.render("response", {pageData: {err: null}});
                            } else {
                                logger.error(err)
                                res.render("response", {pageData: {err: err}});
                            }
                        }
                    );
                }
            }
        }
    }
});



// Log data used by /logplot called from client script.
router.get('/logData', function(req, res, next) {
    data = lowdb_log.getLogData(req.query.daysBack || config.LOG_DAYS_BACK, req.query.type )
    res.send(data)
});

router.get('/logplot', function(req, res, next) {
    res.render('logplot');
});

router.get('*', function(req, res){
    res.status(404)
    res.render('error-404', {}); // This could be a better message
});

module.exports = router;
