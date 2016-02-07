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

function sendIt(req, res, next, err, data, geocodedAddress, altInput, returnHtml) {
    if (err) {
        return next(err)
    }

    if (!returnHtml) {
        res.set('Content-Type', 'text/plain');
    }

    res.send(data);

    // log info about this lookup
    var entry = {
        input: altInput || req.body.Body,
        stop: data.route,
        phone: req.body.From,
        ip: req.connection.remoteAddress,
        geocodedAddress: geocodedAddress
    }
    logRequest(entry)
}


/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index');
});


// Twilio hits this endpoint. The user's text message is
// in the POST body.
// TODO: better error messages
router.post('/', function(req, res, next) {
    var mySendIt = sendIt.bind(null,req,res,next);

    var message = req.body.Body;



    if (message.substring(0, config.FEEDBACK_TRIGGER.length).toUpperCase() == config.FEEDBACK_TRIGGER.toUpperCase()) {
        lib.processFeedback(message.substring(config.FEEDBACK_TRIGGER.length), req, mySendIt, false);
        return;
    }

    lib.parseInputReturnBusTimes(message, mySendIt, false);
});


// This is what the browser hits
router.post('/ajax', function(req, res, next) {
    var mySendIt = sendIt.bind(null, req, res, next)
    lib.parseInputReturnBusTimes(req.body.Body, mySendIt, true);
});


// a browser with location service enabled can hit this
router.get('/byLatLon', function(req, res, next) {
    var output = "";
    if (lib.serviceExceptions()) {
        output = "No Service - Holiday";
        sendIt(req, res, next, null, output)
    } else {

        var data = lib.findNearestStops(req.query.lat, req.query.lon);

        // format the data if it's not just an error string
        output = data;
        if (typeof(data) === 'object') {
            output = lib.formatStopData(data, true);
        }
        sendIt(req, res, next, null, output, null, req.query.lat + ', ' + req.query.lon, true)
    }


});


// feedback form endpoint
router.post('/feedback', function(req, res, next) {
    var mySendIt = sendIt.bind(null,req,res,next);
    lib.processFeedback(req.body.comment, req, mySendIt, true);
});

// Log get
router.get('/logData', function(req, res, next) {
    var daysBack = req.query.daysBack || config.LOG_DAYS_BACK;
    var type = req.query.type;
    var logData = [];
    if (type == "hits") {
        db_private('requests').filter(function(point) {
            if (point.date) {
                var nowTz = moment.tz(new Date(), config.TIMEZONE);
                var dateTz = moment.tz(point.date, config.TIMEZONE);
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
            outPoint.date = point.date;
            logData.push(outPoint);
        })
    }
    sendIt(req, res, next, null, JSON.stringify(logData));
});


module.exports = router;
