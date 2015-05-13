var express = require('express');
var low = require('lowdb')
var hashwords = require('hashwords')()
var router = express.Router();
var stop_number_lookup = require('../lib/stop_number_lookup');
var debug = require('debug')('routes/index.js');
var lib = require('../lib/index');

var db = low('./public/db.json')
var comments = low('./comments.json')

// Log format:
// message is whatever the user sends
// stop is the stop that we've parsed from the message
// data is the current datetime
// if it's sent from twiliio, we store a human-readable hash of the #
function logRequest(entry) {
    entry.date = new Date()
    db('requests').push(entry)
}

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index');
});


// Twilio hits this endpoint. The user's text message is
// in the POST body.
// TODO: better error messages
router.post('/', function(req, res, next) {
    var message = req.body.Body;

    function sendIt(err, data) {
        if (err) {
            next(err)
        }
        res.set('Content-Type', 'text/plain');

        // format the data if it's not just an error string
        var output = data
        if (typeof(data) === 'object') {
            output = lib.formatStopData(data)
        }

        res.send(output)

        // log info about this lookup
        var entry = {
            input: message,
            stop: data.route,
        }
        if (req.body.From) {
            entry.phone = hashwords.hashStr(req.body.From)
        }
        logRequest(entry)
    }

    if (!message || /^\s*$/.test(message)) {
        res.send('No input.\nPlease send a stop number, intersection, or street address to get bus times.');
    }
    else if (/^\d+$/.test(message)) {
        // the message is only digits -- assume it's a stop number
        lib.getStopFromStopNumber(parseInt(message), sendIt);
    }
    else {
        // assume the user sent us an intersection or address
        lib.getStopFromAddress(message, sendIt)
    }
});


router.get('/api', function(req, res, next) {
    if(typeof req.query.stop == "undefined"){
        console.log('could not find route');
    }
    var stopId = req.query.stop.replace(/^0+/, '');
    var bustrackerId = stop_number_lookup[stopId];

    if (!bustrackerId) {
        res.send('Invalid stop number');
    }
    else {
        getStopData(bustrackerId, function(err, data) {
            debug('Good input');

            res.set('Content-Type', 'application/json');
            res.send(data);
        })
    }
});


router.get('/byLatLon', function(req, res, next) {
    var stop = lib.findNearestStop(req.query.lat, req.query.lon);

    lib.getStopFromStopNumber(stop, function(err, data) {
        if (err) {
            next(err)
        }

        // format the data if it's not just an error string
        var output = data
        if (typeof(data) === 'object') {
            output = lib.formatStopData(data)
        }

        res.set('Content-Type', 'text/plain');
        res.send(output)

        // log it
        var entry = {
            input: req.query.lat + ', ' + req.query.lon,
            stop: data.route,
        }
        logRequest(entry)
    });
});


router.post('/feedback', function(req, res, next) {
    comments('comments').push(req.body.comment)
    console.log('This is a comment:')
    console.log(req.body.comment)
    res.send('Thanks for the feedback <br> <a href="/">back</a>')
});


module.exports = router;
