var express = require('express');
var router = express.Router();
var debug = require('debug')('routes/index.js');
var lib = require('../lib/bustracker');
var config = require('../lib/config');
var logger = require('../lib/logger');
var lowdb_log = require('../lib/lowdb_log_transport');
var mw = require('./middleware')


/* GET HOME PAGE */
router.get('/', function(req, res, next) {
        // redirect to https if the user is using http
        if (req.get('X-Forwarded-Proto') && req.get('X-Forwarded-Proto') == 'http') {
            return res.redirect('https://' + req.get('host') + req.originalUrl)
        }
        res.render('index');
    }
);
/*
Facebook Hooks
GET is to do the initial app validation in the Facebook Page setup.
POST is the actual Facebook message handling
*/
router.get('/fbhook', mw.facebook_verify);
router.post('/fbhook', mw.facebook_update);

/*
 TWILIO ENDPOINT
 The user's text message is
 in the POST body.
 TODO: better error messages
 */
router.post('/',
    mw.feedbackResponder_sms,
    mw.checkServiceExceptions,
    mw.sanitizeInput,
    mw.blankInputRepsonder,
    mw.aboutResponder,
    mw.stopNumberResponder,
    mw.addressResponder,
    mw.askWatson
);

/* BROWSER AJAX ENDPOINT */
router.post('/ajax',
    function (req, res, next) {
        res.locals.returnHTML = 1;
        next()
    },
    mw.checkServiceExceptions,
    mw.sanitizeInput,
    mw.blankInputRepsonder,
    mw.aboutResponder,
    mw.stopNumberResponder,
    mw.addressResponder,
    mw.askWatson
);


/*  DIRECT URL ACCESS
 Routes to allow deep linking and bookmarks via url with
 either address, stop number, or about.
 */
router.get('/find/about', function(req, res, next) {
    res.locals.returnHTML = 1;
    res.locals.action = "About"
    res.render('index');

});

router.get('/find/:query', function(req, res, next) {
    req.body.Body = req.params.query
    res.locals.returnHTML = 1;
    res.locals.renderWholePage = 1;
    next();
    },
    // mw.checkServiceExceptions,
    mw.sanitizeInput,
    mw.blankInputRepsonder,
    mw.stopNumberResponder,
    mw.addressResponder,
    mw.askWatson
);

//  a browser with location service enabled can hit this
router.get('/byLatLon',
    mw.checkServiceExceptions,
    mw.findbyLatLon
);


// feedback form endpoint
router.post('/feedback',
    mw.checkServiceExceptions,
    mw.feedbackResponder_web
);

//  Respond to feedback from SMS

router.get('/respond', mw.feedback_get_form); // Make reponse form
router.post('/respond', mw.send_feedback_response); // Handle posts from response form an send



// Log data used by /logplot called from client script.
router.get('/logData', function(req, res, next) {
    data = lowdb_log.getLogData(req.query.daysBack || config.LOG_DAYS_BACK, req.query.type )
    res.send(data)
});

router.get('/logplot', function(req, res, next) {
    res.render('logplot');
});

router.get('*', function(req, res){
    res.status(404)
    res.render('error-404', {}); // This could be a better message
});

module.exports = router;
