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

  if (!message || /^\s*$/.test(message)) {
    res.send('No input. Please send a stop number, intersection, or street address to get bus times.');
  }
  else if (/^\d+$/.test(message)) {
    // the message is only digits -- assume it's a stop number
    lib.getStopFromStopNumber(message, function(err, data) {
        res.set('Content-Type', 'text/plain');
        res.send(data);
    });
  } 
  else {
    // assume the user sent us an intersection or address
    lib.getStopFromAddress(message, function(err, data) {
        res.set('Content-Type', 'text/plain');
        res.send(data);
    })
  }
});

router.get('/api', function(req, res, next) {
  if(typeof req.query.stop == "undefined"){
        console.log('could not find route');
  }
  var stopId = req.query.route;
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
module.exports = router;

