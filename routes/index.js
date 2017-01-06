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



/*
 MIDDLEWARE FUNCTIONS
 These are primarily concerned with parsing the input the comes in from the POST
 body and deciding how to handle it.
 To help logging this sets res.locals.action to one of
 '[Failed?]Stop Lookup' '[Failed?]Address Lookup', 'Empty Input', 'About', 'Feedback'

 */

function feedbackResponder(req, res, next) {
    res.set('Content-Type', 'text/plain');
    var message = req.body.Body || '';
    if (message.substring(0, config.FEEDBACK_TRIGGER.length).toUpperCase() == config.FEEDBACK_TRIGGER.toUpperCase()) {
        res.locals.action = 'Feedback';
        lib.processFeedback(message.substring(config.FEEDBACK_TRIGGER.length), req)
            .then((data)=> {
                if (res.locals.isFB) {
                    sendFBMessage(req.body.From, "Thanks for the feedback");
                } else {
                    res.send("Thanks for the feedback")
                }
            })
            .catch((err)=>logger.warn("Feedback error: ", err));
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
        return res.render('message', function(err, rendered) {
            if (res.locals.isFB) {
                sendFBMessage(req.body.From, rendered);
            } else {
                res.send(rendered);
            }
        })
    }
    next();
}
function aboutResponder(req, res, next){
    var message = req.body.Body;
    if (message.trim().toLowerCase() === 'about') {
        res.locals.action = 'About';
        res.render('about-partial', function(err, rendered) {
            if (res.locals.isFB) {
                sendFBMessage(req.body.From, rendered);
            } else {
                res.send(rendered);
            }
        });
        return;
    }
    next();
}

function getRoutes(req, res, next){
    var input = req.body.Body;
    var stopRequest = input.toLowerCase().replace(/ /g,'').replace("stop",'').replace("#",'');
    if (/^\d+$/.test(stopRequest)) {
        res.locals.action = 'Stop Lookup';
        lib.getStopFromStopNumber(parseInt(stopRequest))
            .then((routeObject) => {
                res.locals.routes = routeObject;
                res.render('routes', function(err, rendered) {
                    if (res.locals.isFB) {
                        sendFBMessage(req.body.From, rendered);
                    } else {
                        res.send(rendered);
                    }
                })
            })
            .catch((err) => {
                res.locals.action = 'Failed Stop Lookup';
                res.render('message', {message: err}, function(err, rendered) {
                    if (res.locals.isFB) {
                        sendFBMessage(req.body.From, rendered);
                    } else {
                        res.send(rendered);
                    }
                })
            })
    }
    else {
        res.locals.action = 'Address Lookup';
        lib.getStopsFromAddress(input)
            .then((routeObject) => {
                res.locals.routes = routeObject;
                res.render('routes', function(err, rendered) {
                    if (res.locals.isFB) {
                        sendFBMessage(req.body.From, rendered);
                    } else {
                        res.send(rendered);
                    }
                });
            })
            .catch((err) => {
                res.locals.action = 'Failed Address Lookup';
                res.render('message', {message: err}, function(err, rendered) {
                    if (res.locals.isFB) {
                        sendFBMessage(req.body.From, rendered);
                    } else {
                        res.send(rendered);
                    }
                })
            })
    }
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

            // Iterate over each messaging event
            pageEntry.messaging.forEach(function(messagingEvent) {
                if (messagingEvent.message) {
                    receivedFBMessage(req, res, messagingEvent);
                } else {
                    logger.warn("fbhook received unknown messagingEvent: ", messagingEvent);
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

function receivedFBMessage(req, res, event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    console.log("Received message for user %d and page %d at %d with message:",
        senderID, recipientID, timeOfMessage);
    console.log(JSON.stringify(message));

    // You may get a text or attachment but not both
    var messageText = message.text;

    if (messageText) {
        req.body.From = senderID;
        req.body.Body = messageText;
        res.locals.isFB = true;
        feedbackResponder(req, res, function() { blankInputRepsonder(req, res, function() { aboutResponder(req, res, function () { getRoutes(req, res) })})})
        // sendMessage(senderID, messageText);
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
    console.log("Trying to send message \"%s\" to recipient %s", messageText, recipientId );

    request({
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: { access_token: config.FB_PAGE_ACCESS_TOKEN },
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;

            if (messageId) {
                console.log("Successfully sent message with id %s to recipient %s",
                    messageId, recipientId);
            } else {
                console.log("Successfully called Send API for recipient %s",
                    recipientId);
            }
        } else {
            console.error("Failed calling Send API: ", error.message);
            console.error("Failed calling Send API", response.statusCode, response.statusMessage);
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
    blankInputRepsonder,
    aboutResponder,
    getRoutes
);

/* BROWSER AJAX ENDPOINT */
router.post('/ajax',
    function (req, res, next) {
        res.locals.returnHTML = 1;
        next()
    },
    blankInputRepsonder,
    aboutResponder,
    getRoutes
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

//  :query should be a stop number searches 
router.get('/find/:query(\\d+)', function(req, res, next) {
    res.locals.action = 'Stop Lookup'
    res.locals.returnHTML = 1;
    lib.getStopFromStopNumber(parseInt(req.params.query))
        .then((routeObject) => {
            res.locals.routes = routeObject;
            res.render('stop-list-non-ajax');
        })
        .catch((err) => {
            res.locals.action = 'Failed Stop Lookup'
            res.render('message-non-ajax', {message: err})
        });
});

//  :query should be everything other than a stop number
//  - assumes address search 
router.get('/find/:query', function(req, res, next) {
    res.locals.action = 'Address Lookup'
    res.locals.returnHTML = 1;
    lib.getStopsFromAddress(req.params.query)
        .then((routeObject) => {
            res.locals.routes = routeObject;
            res.render('route-list-non-ajax');
        })
        .catch((err) => {
            res.locals.action = 'Failed Address Lookup'
            res.render('message-non-ajax', {message: err})
        });
});


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
        .catch((err)=> logger.warn("feedback/ error ", err)); // TODO - tell users if there is a problem or fail silently?
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
                                logger.warn(err.message)
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
