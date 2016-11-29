var express = require('express');
var low = require('lowdb')
var hashwords = require('hashwords')()
var router = express.Router();
var stop_number_lookup = require('../lib/stop_number_lookup');
var debug = require('debug')('routes/index.js');
var lib = require('../lib/index');
var config = require('../lib/config');
var moment = require('moment-timezone');

var db = low('./public/db.json');
var db_private = low('./db_private.json');
var fs = require('fs');

var twilioClient = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);


/* QUESTIONS
    What should be logged - i.e. errors, about page, lat/lon requests, geocode time etc.
    It would probably be nice to put logging in it's own module
    Do we need to include empty fields such as phone on web requests?
*/

// Log format:
// message is whatever the user sends
// stop is the stop that we've parsed from the message
// data is the current datetime
// if it's sent from twiliio, we store a human-readable hash of the #



function logRequest(locals) {
    var entry = {
        date     : new Date(), // Why not Date.now() to avoid allocating object?
        totalTime: Date.now() - locals.startTime, // TODO: should this be more accurate?
        input    : this.body.Body, // this refers to the request object.
        phone    : this.body.From,
        ip       : this.connection.remoteAddress
    }
    if (locals.routes){ // only here when finding bus routes, not feedback, etc.
        var routes            = locals.routes;
        entry.stop            = routes.data.stopId || "";
        entry.geocodedAddress = routes.data.geocodedAddress;
        entry.muniTime        = routes.muniTime;
        entry.geocodeTime     = routes.geocodeTime;
    }
    
    db_private('requests').push(entry);
    var entry2 = JSON.parse(JSON.stringify(entry)); // Required because of async mode of lowdb
    if (entry.phone) {
        entry2.phone = hashwords.hashStr(entry.phone);
    }
    entry2.ip = "";
    db('requests').push(entry2); 
    
}


/* 
MIDDLEWARE FUNCTIONS 
*/

function aboutResponder(req, res, next){
    var message = req.body.Body;
    if (message.trim().toLowerCase() === 'about') {
        res.locals.action = 'About'
        res.render('about-partial');     
        return;  
    }
    next();
}

function getRoutes(req, res, next){
    var input = req.body.Body;
    if (!input || /^\s*$/.test(input)) {
        res.locals.action = 'Empty Input'
        res.locals.message = {name: "No input!", message:'Please send a stop number, intersection, or street address to get bus times.'}
        return res.render('message')
    }

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
    }
    else {
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
    }
}

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index');
});


// Twilio hits this endpoint. The user's text message is
// in the POST body.
// TODO: better error messages
router.post('/',
    function (req, res, next){
        res.set('Content-Type', 'text/plain');
        var message = req.body.Body || '';
        if (message.substring(0, config.FEEDBACK_TRIGGER.length).toUpperCase() == config.FEEDBACK_TRIGGER.toUpperCase()) {
            lib.processFeedback(message.substring(config.FEEDBACK_TRIGGER.length), req)
            .then((data)=>res.send("Thanks for the feedback"))
            .catch((err)=>console.log("Feedback error: ", err));
            return;
        }
        next();
    },
    aboutResponder,
    getRoutes
);

// This is what the browser hits
router.post('/ajax', 
    function (req, res, next) {
        res.locals.returnHTML = 1;
        next()
    },
    aboutResponder,
    getRoutes
);

 
// Routes to allow direct access via url with 
// either address, stop number, or about.

router.get('/find/about', function(req, res, next) {
    res.locals.returnHTML = 1;
    res.locals.action = "About"
    res.render('index');

});

// :query should be a stop number searches 
router.get('/find/:query(\\d+)', function(req, res, next) {
    res.locals.action = 'Stop Lookup'
    res.locals.returnHTML = 1;
    lib.getStopFromStopNumber(parseInt(req.params.query))
    .then((routeObject) => {
        res.locals.routes = routeObject;
        res.render('routes-non-ajax');
    })
    .catch((err) => {
        res.render('message-non-ajax', {message: err})
    });
});

// :query should be everything other than a stop number - assumes address search 
router.get('/find/:query', function(req, res, next) {
    res.locals.action = 'Address Lookup'
    res.locals.returnHTML = 1;
    lib.getStopsFromAddress(req.params.query)
    .then((routeObject) => {
        res.locals.routes = routeObject;
        res.render('routes-non-ajax');
    })
    .catch((err) => {
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
    .catch((err)=> console.log("feedback/ error ", err)); // TODO - tell users if there is a problem or fail silently?
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
                                console.log(err.message)
                                res.render("response", {pageData: {err: err}});
                            }
                        }
                    );
                }
            }
        }
    }
});



// Log get
router.get('/logData', function(req, res, next) {
    var daysBack = req.query.daysBack || config.LOG_DAYS_BACK;
    var type = req.query.type;
    var logData = [];
    var timezone = moment.tz.zone(config.TIMEZONE);
    if (type == "hits") {
        var dateTz = null;
        db_private('requests').filter(function(point) {
            if (point.date) {
                var nowTz = moment.tz(new Date(), config.TIMEZONE);
                dateTz = moment.tz(point.date, config.TIMEZONE);
                if (moment.duration(nowTz.diff(dateTz)).asDays() <= daysBack) {
                    return true;
                }
            }
            return false;
        }).forEach(function(point) {
            var hitType = "browser";
            if (point.hasOwnProperty("phone")) {
                hitType = "sms"
            }
            var outPoint = {};
            outPoint.type = hitType;
            outPoint.date = moment.tz(point.date, config.TIMEZONE).unix();
            outPoint.dateOffset = timezone.offset(outPoint.date*1000)
            outPoint.muniTime = point.muniTime || "";
            outPoint.totalTime = point.totalTime || "";
            outPoint.userId = point.phone ? "phone" + point.phone : "ip"+point.ip;
            logData.push(outPoint);
        })
    }
    res.send(logData);
});

router.get('/logplot', function(req, res, next) {
    res.render('logplot');
});

router.get('*', function(req, res){
    res.status(404)
    res.render('error-404', {}); // This could be a better message
});



module.exports = router;
