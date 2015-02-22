var express = require('express');
var router = express.Router();
var stop_number_lookup = require('../lib/stop_number_lookup');
var debug = require('debug')('routes/index.js');
var lib = require('../lib/index');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index');
});

/* POST home page */
router.post('/', function(req, res, next) {
  var stopId = req.body.stopNumber;
  var intersection = req.body.intersection;

  console.dir(lib)

  if (stopId) {
    var bustrackerId = stop_number_lookup[stopId];

    if (!bustrackerId) {
        debug('Bad input');
        debug(stopId);
        res.send('Invalid stop number');
    }
    else {
        lib.getStopData(bustrackerId, function(err, data) {
            debug('Good input');

            res.set('Content-Type', 'text/plain');
            res.send(data);
        })
    }
  } 
  else if (intersection) {
    lib.getStopFromAddress(intersection, function(err, data) {
        debug('Good input');

        res.set('Content-Type', 'text/plain');
        res.send(data);
    })
  } else {
    res.send('No input');
  }
});

module.exports = router;
