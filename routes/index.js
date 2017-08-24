var express = require('express');
var router = express.Router();
var debug = require('debug')('routes/index.js');
var lib = require('../lib/bustracker');
var config = require('../lib/config');
var fs = require('fs');
var twilioClient = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
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

router.get('/fbhook', mw.facebook_verify);
router.post('/fbhook', mw.facebook_update);

/*
 TWILIO ENDPOINT
 The user's text message is
 in the POST body.
 TODO: better error messages
 */
router.post('/',
    mw.feedbackResponder,
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
router.post('/feedback', mw.checkServiceExceptions,mw.send_feedback);

//  Respond to feedback over SMS
router.get('/respond', function(req, res, next) {
    var comments = JSON.parse(fs.readFileSync('./comments.json'));
    for(var i=comments.comments.length-1; i >= 0; i--) {
        if (comments.comments[i].response_hash && (comments.comments[i].response_hash == req.query.hash)) {
            if (comments.comments[i].phone) {
                res.render("respond", {pageData: {hash: comments.comments[i].response_hash, feedback: comments.comments[i].feedback, phone: comments.comments[i].phone}});
                return
            }
        }
    }
    res.sendStatus(404);    // Simulate page not found
});

router.post('/respond', function(req, res, next) {
    var comments = JSON.parse(fs.readFileSync('./comments.json'));
    var foundIt = false;
    for(var i=comments.comments.length-1; i >= 0 && !foundIt; i--) {
        if (comments.comments[i].response_hash && (comments.comments[i].response_hash == req.body.hash)) {
            if (comments.comments[i].phone) {
                foundIt = true;
                if (req.body.response) {
                    twilioClient.messages.create({
                            to: comments.comments[i].phone,
                            from: config.MY_PHONE,
                            body: req.body.response }, function(err, message) {
                            if (!err) {
                                var entry = {
                                    response: req.body.response,
                                    to_phone: comments.comments[i].phone
                                };
                                res.render("response", {pageData: {err: null}});
                            } else {
                                logger.error(err)
                                res.render("response", {pageData: {err: err}});
                            }
                        }
                    );
                }
            }
        }
    }
});



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
