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

        res.send(output);

        // log info about this lookup
        var entry = {
            input: message,
            stop: data.route,
            phone: hashwords.hashStr(req.body.From),
        }
        logRequest(entry)
    }

    lib.parseInputReturnBusTimes(sendIt);
});


// This is what the browser hits
router.post('/ajax', function(req, res, next) {
    lib.parseInputReturnBusTimes(req.body.Body, function(err, data) {

        res.send(data);

        // log info about this lookup
        logRequest({
            input: req.body.Body,
            stop: data.route,
        });
    });
});


// a browser with location service enabled can hit this
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


// feedback form endpoint
router.post('/feedback', function(req, res, next) {
    comments('comments').push(req.body.comment)
    console.log('This is a comment:')
    console.log(req.body.comment)
    res.send('Thanks for the feedback <br> <a href="/">back</a>')
});


module.exports = router;
