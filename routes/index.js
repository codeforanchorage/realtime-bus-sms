'use strict';

const express = require('express')
const router = express.Router()
const debug = require('debug')('routes/index.js')
const lib = require('../lib/bustracker')
const config = require('../lib/config')
const logger = require('../lib/logger')
const feedback = require('../lib/feedback')
const lowdb_log = require('../lib/lowdb_log_transport')
const mw = require('./middleware')
const fb = require('../lib/facebook')

/**
 * Express routes for Bus App
 * @module routes/index
 */

/**
 * Index page for web clients
 */
router.get('/', function(req, res, next) {
        // redirect to https if the user is using http
        if (req.get('X-Forwarded-Proto') && req.get('X-Forwarded-Proto') == 'http') {
            return res.redirect('https://' + req.get('host') + req.originalUrl)
        }
        res.render('index');
    }
);

/**
 *  TWILIO ENDPOINT
 *  The user's text message is
 *  in the POST body.
 */

router.post('/',
    feedback.feedbackResponder_sms,
    mw.sanitizeInput,
    mw.checkServiceExceptions,
    mw.addLinkToRequest,
    mw.blankInputRepsonder,
    mw.aboutResponder,
    mw.stopNumberResponder,
    mw.askWatson,
    mw.addressResponder,
);

/* BROWSER AJAX ENDPOINT */

router.post('/ajax',
    function (req, res, next) {
        res.locals.returnHTML = 1;
        next()
    },
    mw.sanitizeInput,
    mw.checkServiceExceptions,
    mw.blankInputRepsonder,
    mw.aboutResponder,
    mw.stopNumberResponder,
    mw.askWatson,
    mw.addressResponder,
);

/*
    DIRECT URL ACCESS
    Routes to allow deep linking and bookmarks via url with
    either address, stop number, or about, for example:
    https://bus.codeforanchorage.org/find/2051
 */

 router.get('/find/about', function(req, res, next) {
    res.locals.returnHTML = 1;
    res.locals.action = "About"
    res.render('index');

});

router.get('/find/', function(req, res, next) {
    res.locals.returnHTML = 1;
    res.render('index');
});

router.get('/find/:query', function(req, res, next) {
    req.body.Body = req.params.query
    res.locals.returnHTML = 1;
    res.locals.renderWholePage = 1;
    next();
    },
    mw.checkServiceExceptions,
    mw.blankInputRepsonder,
    mw.stopNumberResponder,
    mw.askWatson,
    mw.addressResponder

);

/*
    BROWSER FIND BY CURRENT LOCATION
    A browser with location service enabled can hit this
    It requires https on most browsers
*/

router.get('/byLatLon',
    mw.checkServiceExceptions,
    mw.findbyLatLon
);

/*
    FACEBOOK HOOKS
    GET is to do the initial app validation in the Facebook Page setup.
    POST is the actual Facebook message handling
*/

router.get('/fbhook', fb.verify);
router.post('/fbhook', fb.update);


/*  FEEDBACK FORM ENDPOINT */

router.post('/feedback',
    feedback.feedbackResponder_web
);

/*
    RESPONSE TO FEEDBACK FROM SMS
    GET is to make the response form
    POST handles the reponse from that form
*/

router.get('/respond', feedback.feedback_get_form);
router.post('/respond', feedback.send_feedback_response);


/*
    LOG DATA
    Provides ajax data for the log plot
*/

router.get('/logData', function(req, res, next) {
    data = lowdb_log.getLogData(req.query.daysBack || config.LOG_DAYS_BACK, req.query.type )
    res.send(data)
});

/*
    LOG PLOT
    Draws plot from data provided by /logData
*/

router.get('/logplot', function(req, res, next) {
    res.render('logplot');
});

router.get('*', function(req, res){
    res.status(404)
    res.render('error-404', {}); // This could be a better message
});

module.exports = router;
