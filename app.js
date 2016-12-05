var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
//var logs = require('./lib/logTransport');
//var logger = require('./lib/logTransport').logger;
var logger = require('./lib/logTransport');
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

app.use(logger.startlog)

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
