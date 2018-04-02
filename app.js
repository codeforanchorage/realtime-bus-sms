'use strict';

const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const logs = require('./lib/logger');
const cookieParser = require('cookie-parser');
const UUID = require("pure-uuid");
const bodyParser = require('body-parser');
const rollbar = require("rollbar");
const config = require('./lib/config');
const lib = require('./lib/bustracker');
const fb = require('./lib/facebook')
const lowDB_transport = require('./lib/lowdb_log_transport')
const routes = require('./routes/index');

rollbar.init(config.ROLLBAR_TOKEN);

const app = express();

/* view engine setup */
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.set('trust proxy', true); // client’s IP address will be left-most entry in the X-Forwarded-* header
require('run-middleware')(app);

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));

app.use(cookieParser());

// set simple session cookie
// used to determine new vs returning web users
app.use(function(req, res, next){
    if(!(req.cookies) || !('uuid' in req.cookies)) {
        const uuid = new UUID(4); //v4 UUID are random
        res.cookie('uuid', uuid.format(), {expires: new Date(2147483648000)}) // way in the future
        res.session = uuid;
    }
    else {
        res.session = req.cookies['uuid']
    }
    next();
})

/**
 * SETUP LOGGING
 * This sets which fields in addition to the defaults in logger.js should be logged
 * After these values are logged other transports such as Google Analytics can
 * choose to send them so other services.
 */
app.use(logs.initialize((req, res) => {
    const routes = res.locals.routes
    return {
        input:           req.body.Body,
        phone:           req.body.isFB ? undefined : req.body.From,
        fbUser:          req.body.isFB ? req.body.From : undefined,
        muniTime:        routes ? routes.muniTime: undefined,
        geocodeTime:     routes ? routes.geocodeTime: undefined,
        stopId:          routes ? routes.data.stopId: undefined,
        geocodedAddress: routes ? routes.data.geocodedAddress: undefined,
        action:          res.locals.action,
    }
}));

/**
 * SETUP GOOGLE ANALYTICS
 * The convention used here is:
 * category: 'sms | 'web' | 'fb'
 * action: actions are set by the router depending on what the user was looking for
 *         currently: '[Failed?]Stop Lookup' '[Failed?]Address Lookup', 'Empty Input', 'About', 'Feedback'
 * label:  the actual search: the stop number, geocoded address, or the raw input if lookup failed
 */
logs.initGoogleAnalytics((logFields) => {
    //  There should be a UUID in the req.session which will be found by default
    //  But Twilio's expires after 4 hours so this makes a more stable phone-based
    //  one for SMS users
    let uuid;
    const category = logFields.phone ? "sms" : (logFields.fbUser ? "fb" : "web");
    if ((category == "sms") || (category == "fb")){
        var ns = "deebee62-076c-47ef-ad02-2509e2d4f839" // this random namespace is hashed (using SHA-1) with phone number to create UUID
        uuid = new UUID(5, ns, logFields.phone || logFields.fbUser).format()
    }

    return {
        trackingCode: config.GOOGLE_ANALYTICS_ID,
        category:     category,
        action:       logFields.action,
        label:        logFields.stopId || logFields.geocodedAddress  || (logFields.input ? logFields.input.trim().toLowerCase(): ""),
        value:        logFields.responseTime,
        uuid:         uuid,
        timings:      [{name: "muniTime", time: logFields.muniTime }]
    }
})

/**
 * Add custom transport for logging to lowDB
 * This is in its own module becuase rather than the logger module
 * because it's all very specific to the bus app.
 */
logs.add(lowDB_transport(), {})

app.use('/fbhook', bodyParser.json({ verify: fb.verifyFBRequestSignature }));  //For Facebook requests
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);

// catch 404 for anything not handled in routes.
app.use(function(req, res, next) {
    res.status(404)
    res.send("NOT FOUND")
});

// error handlers
app.use(rollbar.errorHandler(process.env.ROLLBAR_TOKEN));
rollbar.handleUncaughtExceptionsAndRejections(
    process.env.ROLLBAR_TOKEN,
    {exitOnUncaughtException: true}
);

module.exports = app;
