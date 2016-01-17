var express = require('express');
var low = require('lowdb')
var hashwords = require('hashwords')()
var router = express.Router();
var stop_number_lookup = require('../lib/stop_number_lookup');
var debug = require('debug')('routes/index.js');
var lib = require('../lib/index');
var config = require('../lib/config')


var db = low('./public/db.json')

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

        res.send(data);

        // log info about this lookup
        var entry = {
            input: message,
            stop: data.route,
            phone: hashwords.hashStr(req.body.From),
        }
        logRequest(entry)
    }

    if (message.substring(0, config.FEEDBACK_TRIGGER.length).toUpperCase() == config.FEEDBACK_TRIGGER.toUpperCase()) {
        lib.processFeedback(message.substring(config.FEEDBACK_TRIGGER.length), sendIt, false);
        return;
    }

    lib.parseInputReturnBusTimes(message, sendIt);
});


// This is what the browser hits
router.post('/ajax', function(req, res, next) {
    lib.parseInputReturnBusTimes(req.body.Body, function(err, data) {
        if (err) return next(err);

        res.send(data);

        // log info about this lookup
        logRequest({
            input: req.body.Body,
            stop: data.route,
        });
    }, true);
});


// a browser with location service enabled can hit this
router.get('/byLatLon', function(req, res, next) {
    var output = "";
    if (lib.serviceExceptions()) {
        output = "No Service - Holiday";
    } else {

        var data = lib.findNearestStops(req.query.lat, req.query.lon);

        // format the data if it's not just an error string
        output = data;
        if (typeof(data) === 'object') {
            output = lib.formatStopData(data, true);
            // log it
            var entry = {
                input: req.query.lat + ', ' + req.query.lon,
                stop: data.route,
            }
            logRequest(entry)
        }
    }

    res.set('Content-Type', 'text/plain');
    res.send(output)

});


// feedback form endpoint
router.post('/feedback', function(req, res, next) {
    function respond(err, response) {
        res.send(response);
    }
    lib.processFeedback(req.body.comment, respond, true);
});


module.exports = router;
