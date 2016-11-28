var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logs = require('./lib/logTransport');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
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

app.use(logs())
/*
logger.token('stop', (req, res) => {
    return res.locals.routes
    ?  res.locals.routes.data.stopId || undefined
    : undefined;
})
logger.token('geoCodedAddress', (req, res) => {
    return res.locals.routes 
        ? res.locals.routes.data.geocodedAddress || undefined
        : undefined;
})
logger.token('muniTime', (req, res) => {
    return res.locals.routes 
        ? res.locals.routes.muniTime || undefined
        : undefined;
})
logger.token('geocodeTime', (req, res) => {
    return res.locals.routes 
        ? res.locals.routes.geocodeTime || ""
        : "";
})

//app.use(logger('common'));
app.use(logger(':remote-addr - [:date[iso]] ":method :url HTTP/:http-version" :status :res[content-length] :response-time :muniTime :geocodeTime :stop :geoCodedAddress', {
    skip: function(req, res) {
            return res.statusCode < 400 && ( 
                req.url.startsWith('/css') 
                || req.url.startsWith('/javascripts') 
                || req.url.startsWith('/img')
                )},
    stream: logTransport.stream
    }));

*/
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
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
