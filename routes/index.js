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



// Log format:
// message is whatever the user sends
// stop is the stop that we've parsed from the message
// data is the current datetime
// if it's sent from twiliio, we store a human-readable hash of the #

function logRequest(entry) {
    entry.date = new Date();
    db_private('requests').push(entry);
    var entry2 = JSON.parse(JSON.stringify(entry)); // Required because of async mode of lowdb
    if (entry.phone) {
        entry2.phone = hashwords.hashStr(entry.phone);
    }
    entry2.ip = "";
    db('requests').push(entry2);
}

function startLogging(req, res, next){
     res.locals.logEntry = {
        input: req.body.Body,
        stop: "",
        phone: req.body.From,
        ip: req.connection.remoteAddress,
        geocodedAddress: "",
        totalTime: "",  // Should really go on res.on('finish'), but do we want to only log on successful sends?
        muniTime:  "",
        geocodeTime: ""
    };
    res.locals.startTime = Date.now();
    next();
}

function parseBody(req, res, next){
    var message = req.body.Body;
    if (!message || /^\s*$/.test(message)) {
        res.locals.message = {name: "No input!", message:'Please send a stop number, intersection, or street address to get bus times.'};
        res.render('message')
        return;
    }
    if (message.trim().toLowerCase() === 'about') {
       res.render('about-partial'); 
       return;  
    }
    // the message is only digits or # + digits or "stop" + (#) + digits -- assume it's a stop number
    var stopMessage = message.toLowerCase().replace(/ /g,'').replace("stop",'').replace("#",'');
    var log = res.locals.logEntry;
    if (/^\d+$/.test(stopMessage)) {
        lib.getStopFromStopNumber(parseInt(stopMessage))
        .then((routeObject) => {
            log.muniTime = routeObject.asyncTime;
            log.stop = routeObject.data.stopId || "";
            log.totalTime = Date.now() - res.locals.startTime;
            logRequest(log);
            res.render('stop-list-partial', {route:routeObject.data})
        })
        .catch((err) => res.render('message', {message: err}));
    } else {
        lib.getStopsFromAddress(req.body.Body)
        .then((routeObject) => {        
            log.geocodedAddress = routeObject.data.geocodedAddress || "";
            log.geocodeTime = routeObject.asyncTime;
            log.totalTime = Date.now() - res.locals.startTime;
            logRequest(log);
            res.render('route-list-partial', {routes:routeObject.data.stops})})
        .catch((err) => res.render('message', {message: err})); 
    } 

    return
}

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index');
});

router.use(startLogging); //after get('/') means homepage requests don't get logged.

// Twilio hits this endpoint. The user's text message is
// in the POST body.
// TODO: better error messages
router.post('/', function(req, res, next) {
    var message = req.body.Body;
   if (message.substring(0, config.FEEDBACK_TRIGGER.length).toUpperCase() == config.FEEDBACK_TRIGGER.toUpperCase()) {
        lib.processFeedback(message.substring(config.FEEDBACK_TRIGGER.length), req)
        .then((data)=>res.send("Thanks for the feedback"))
        .catch((err)=>console.log("Feedback error: ", err));
        return;
    }
    next();
    },
    parseBody
);


// This is what the browser hits
router.post('/ajax', function(req, res, next) {
    res.locals.returnHTML = 1;
    next()
    },
    parseBody
);

// a browser with location service enabled can hit this
router.get('/byLatLon', function(req, res, next) {
    res.locals.returnHTML = 1;

    if (lib.serviceExceptions()) {
        res.locals.error = {message:'No Service - Holiday'};
        res.render('message')
        return;
    }
    if (!req.query.lat || !req.query.lon){
        req.logEntry.geocodedAddress = "not found";
        res.render('message', {message: {message: "Can't determine your location"}});
        return;
     }
     var data = lib.findNearestStops(req.query.lat, req.query.lon);
     if (!data || data.length == 0){
         res.render('message', {message: {message: "No routes found near you"}});
         return;
     }
     res.render('route-list-partial', {routes:  data });
});


// feedback form endpoint
router.post('/feedback', function(req, res) {
    res.locals.returnHTML = 1
    lib.processFeedback(req.body.comment, req)
    .then((res) => console.log("in then: ", res))
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
                                logRequest(entry);
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





module.exports = router;
