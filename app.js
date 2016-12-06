var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logs = require('./lib/logTransport');
var logger = require('./lib/logTransport').logger;
var cookieParser = require('cookie-parser');
var UUID = require("pure-uuid");
var bodyParser = require('body-parser');
var rollbar = require("rollbar");
var config = require('./lib/config');

rollbar.init(config.ROLLBAR_TOKEN);

var routes = require('./routes/index');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));

app.use(logs.initialize((req, res) => {
    var routes = res.locals.routes
    return {
        input:           req.body.Body,
        phone:           req.body.From,
        muniTime:        routes ? routes.muniTime: undefined,
        geocodeTime:     routes ? routes.geocodeTime: undefined,
        stopId:          routes ? routes.data.stopId: undefined,
        geocodedAddress: routes ? routes.data.geocodedAddress: undefined,
        action:          res.locals.action,
    }
}));

/*  
    Setup Google Analytics
    The convention used here is:
    category: 'sms | 'web'
    action: actions are set by the router depending on what the user was looking for
           currently: '[Failed?]Stop Lookup' '[Failed?]Address Lookup', 'Empty Input', 'About', 'Feedback'
    label: the actual search: the stop number, geocoded address, or the raw input if lookup failed

*/
logs.initGoogleAnalytics((logFields) => {
    // UUID helps seperate new and returning users on Twilio
    var uuid;
    var category = logFields.phone ? "sms" : "web";
    if (category == "sms"){
        var ns = "deebee62-076c-47ef-ad02-2509e2d4f839" // this random namespace is hashed (using SHA-1) with phone number to create UUID
        uuid = new UUID(5, ns, logFields.phone).format()
    }
    return {
        trackingCode: config.GOOGLE_ANALYTICS_ID,
        category:     category,
        action:       logFields.action,
        label:        logFields.stopId 
                      || logFields.geocodedAddress 
                      || (logFields.input ? logFields.input.trim().toLowerCase(): ""),
        value:        logFields.responseTime,
        uuid:         uuid,
        timings:      [{name: "muniTime", time: logFields.muniTime }]

    }
})

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

// set simple session cookie - used to determine new vs returning users
app.use(function(req, res, next){
    if(!(req.cookies) || !('uuid' in req.cookies)) {
        var uuid = new UUID(4); //v4 UUID are random
        res.cookie('uuid', uuid.format(), {expires: new Date(2147483648000)}) // essentially never
    }
    next();
})

app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers
app.use(rollbar.errorHandler(process.env.ROLLBAR_TOKEN));
rollbar.handleUncaughtExceptionsAndRejections(
    process.env.ROLLBAR_TOKEN,
    {exitOnUncaughtException: true}
);

module.exports = app;
