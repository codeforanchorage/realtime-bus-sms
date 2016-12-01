var express = require('express');
var low = require('lowdb')
var router = express.Router();
var stop_number_lookup = require('../lib/stop_number_lookup');
var debug = require('debug')('routes/index.js');
var lib = require('../lib/index');
var config = require('../lib/config');
var db = low('./public/db.json', { storage: require('lowdb/lib/file-async') });
var db_private = low('./db_private.json', { storage: require('lowdb/lib/file-async') });
var fs = require('fs');

var twilioClient = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
var logTransport = require('../lib/logTransport')
var loggerTransport = logTransport;
var logger = loggerTransport.logger;
var watson = require('watson-developer-cloud');

/* 
    WATSON MIDDLE WARE 
    TODO track sessions - twilio accepts cookies for this - so we can make converstations that hold state
    Test intent confidence to decide to help decide flow
*/
function askWatson(req, res, next){
    logger.debug("Calling Watson")
    var input = req.body.Body.replace(/['"]+/g, '');
    var conversation = watson.conversation({
        username: config.WATSON_USER,
            password: config.WATSON_PASSWORD,
          version: 'v1',
        version_date: '2016-09-20'
    })

    var context = {};

    conversation.message( {
        workspace_id: '3c0af131-83a9-4ac4-aff7-c020477f5e44',
        input: {'text': input},
        context: context
        }, function(err, response) {
            if (err) {
                logger.error('watson error:', err); // TODO this should go to Rollbar in production
                return res.render('message', {message: 'Bustracker is having a problem right now'})
            } else {
                var intent = response.intents[0]['intent']
                logger.debug("intent", intent)
                switch(intent) {
                    case "next_bus": 
                        var stops = response.entities.filter((element) =>  element['entity'] == "sys-number"  );
                        logger.debug("stops: ", stops)
                        var stop = stops[0]
                        if (stop) {
                            res.locals.action = 'Stop Lookup'
                            lib.getStopFromStopNumber(parseInt(stops[0].value))
                            .then((routeObject) => {
                                res.locals.routes = routeObject;
                                res.render('routes');
                            })
                            .catch((err) => {
                                res.locals.action = 'Failed Stop Lookup'
                                res.render('message', {message: err})
                            })
                            return;
                        } else {
                            //this shouldn't ever happen
                            logger.error("Watson returned a next_bus intent with no stops.")
                        }
                case("address"):
                    res.locals.action = 'Address Lookup'
                    lib.getStopsFromAddress(response.input.text)
                    .then((routeObject) => {
                        res.locals.routes = routeObject;
                        res.render('routes');
                    })
                    .catch((err) => {
                        res.locals.action = 'Failed Address Lookup'
                        res.render('message', {message: err})
                    })
                    return
                default:
                    logger.debug("winston repsone: ", response)
                    res.locals.message = {message:response.output.text.join(' ')}
                    return res.render('message')

            }
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

function handleAbout(req, res, next){
    var message = req.body.Body;
    if (message.trim().toLowerCase() === 'about') {
        res.locals.action = 'About'
        res.render('about-partial');     
        return;  
    }
    next();
}

function handleBlank(req,res,next){
    var input = req.body.Body;
    if (!input || /^\s*$/.test(input)) {
        // res.locals.action is caching the event type which we can use later when logging anlytics
        res.locals.action = 'Empty Input' 
        res.locals.message = {name: "No input!", message:'Please send a stop number, intersection, or street address to get bus times.'}
        return res.render('message')
    }
    next()
}

function handleStopNumber(req,res, next){
    var input = req.body.Body;
    var stopRequest = input.toLowerCase().replace(/ /g,'').replace("stop",'').replace("#",'');
    if (/^\d+$/.test(stopRequest)) {
        res.locals.action = 'Stop Lookup'
        lib.getStopFromStopNumber(parseInt(stopRequest))
        .then((routeObject) => {
            res.locals.routes = routeObject;
            res.render('routes');
        })
        .catch((err) => {
            res.locals.action = 'Failed Stop Lookup'
            res.render('message', {message: err})
        })
        return;
    }
    next()
}
/* Watson does this now
function getRoutes(req, res, next){
    res.locals.action = 'Address Lookup'
    lib.getStopsFromAddress(input)
    .then((routeObject) => {
        res.locals.routes = routeObject;
        res.render('routes');
    })
    .catch((err) => {
        res.locals.action = 'Failed Address Lookup'
        res.render('message', {message: err})
    })
    return;  
}
*/

// GET home page. 
router.get('/', function(req, res, next) { 
    res.render('index');
});


/*  
    Twilio hits this endpoint. The user's text message is
    in the POST body.
    TODO: better error messages
*/
router.post('/',
    function (req, res, next){
        res.set('Content-Type', 'text/plain');
        var message = req.body.Body || '';
        if (message.substring(0, config.FEEDBACK_TRIGGER.length).toUpperCase() == config.FEEDBACK_TRIGGER.toUpperCase()) {
            res.locals.action = 'Feedback'
            lib.processFeedback(message.substring(config.FEEDBACK_TRIGGER.length), req)
            .then((data)=>res.send("Thanks for the feedback"))
            .catch((err)=>logger.warn("Feedback error: ", err));
            return;
        }
        next();
    },
    handleBlank,
    handleAbout,
    handleStopNumber,
    askWatson
);

// This is what the browser hits
router.post('/ajax', 
    function (req, res, next) {
        res.locals.returnHTML = 1;
        next()
    },
    handleBlank,
    handleAbout,
    handleStopNumber,
    askWatson
);

 
// Routes to allow direct access via url with 
// either address, stop number, or about.

router.get('/find/about', function(req, res, next) {
    res.locals.returnHTML = 1;
    res.locals.action = "About"
    res.render('index');

});

// :query should be a plain stop number 
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

// :query should be everything other than a stop number
// - assumes address search 

/* TODO integrate Watson here so page refreshes and bookmarks use flow */
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


// a browser with location service enabled can hit this
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
    lib.processFeedback(req.body.comment, req)
    .then()
    .catch((err)=> logger.warn("feedback/ error ", err)); // TODO - tell users if there is a problem or fail silently?
    res.render('message', {message: {message:'Thanks for the feedback'}});
});

// Respond to feedback over SMS
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
    data = logTransport.getLogData(req.query.daysBack || config.LOG_DAYS_BACK, req.query.type )
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
