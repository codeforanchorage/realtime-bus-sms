var express = require('express');
var router = express.Router();
var stop_number_lookup = require('../lib/stop_number_lookup');
var debug = require('debug')('routes/index.js');
var lib = require('../lib/index');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index');
});

// Twilio hits this endpoint. The user's text message is 
// in the POST body.
// TODO: better error messages
router.post('/', function(req, res, next) {
  var message = req.body.Body;

  var isOnlyDigits = /^\d+$/.test(message);

  if (isOnlyDigits) {
    var stopId = message;
    var bustrackerId = stop_number_lookup[stopId];

    if (!bustrackerId) {
        debug('Bad input');
        debug(stopId);
        res.send('Invalid stop number');
    }
    else {
        lib.getStopFromBusTrackerId(bustrackerId, function(err, data) {
            debug('Good input');

            res.set('Content-Type', 'text/plain');
            res.send(data);
        })
    }
  } 
  else {
    // assume the user sent us an intersection or address
    var address = message;
    
    lib.getStopFromAddress(address, function(err, data) {
        debug('Good input');

        res.set('Content-Type', 'text/plain');
        res.send(data);
    })
  }
});

module.exports = router;
