var express = require('express');
var router = express.Router();
var stop_number_lookup = require('../lib/stop_number_lookup');
var debug = require('debug')('routes/index.js');
var getStopData = require('../lib/index');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index');
});

/* POST home page */
router.post('/', function(req, res, next) {
  var stopId = req.body.Body;
  var bustrackerId = stop_number_lookup[stopId];

  if (!bustrackerId) {
      debug('Bad input');
      debug(stopId);
      res.send('Invalid stop number');
  }
  else {
      getStopData(bustrackerId, function(err, data) {
          debug('Good input');

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
      debug('Bad input');
      debug(stopId);
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

