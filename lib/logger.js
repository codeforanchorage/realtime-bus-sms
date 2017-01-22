var winston = require('winston');
var ua = require('universal-analytics')
var onFinished = require('on-finished')
var util = require('util');
var onHeaders = require('on-headers');
var UUID = require("pure-uuid");

var CONSOLE_LOG_LEVEL = 'debug';
var config = require('./config')
var rollbar = require('rollbar');
rollbar.init(config.ROLLBAR_TOKEN);

var logger = new winston.Logger();

/*
    CONSOLE LOGGING
    This will log any request to the console greater than CONSOLE_LOG_LEVEL
    The levels are by default NPM's logging levels:
    error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5
    When CONSOLE_LOG_LEVEL is set to 'info' it will write all messages
    with levels error, warn, and info. 

    You can add debug code with:
    logger.debug(message), which will only show in transports that want it. 

*/
logger.add(winston.transports.Console, {
    name: 'console.info',
    colorize: true,
    showLevel: true,
    level: CONSOLE_LOG_LEVEL,
    formatter: consoleFormatter
})
function consoleFormatter(options){
    // Messages will usually be debug or warnings (to send message to console use logger.debug(message) ) 
    // We only want custom format for the auto-middleware logging. When called with logger.debug("message", args) it should
    // act like console.log but with a colorized level indication
    var meta = options.meta;
    var logMessage = (meta && 'status' in meta) 
                     ? winston.config.colorize(options.level) + `: ${meta.status} ${meta.ip} ${meta.method} ${meta.url} ${meta.input || ""}`
                     : winston.config.colorize(options.level) + `: ${options.message}` + (options.meta && Object.keys(options.meta).length ? JSON.stringify(options.meta,  null, '  ') : '' );
                     
    return logMessage
}
/* ROLLBAR ERROR LOGGING 
   This transport will allow sending messages with logging level of error directly to rollbar.
   It will require a ROLLBAR_TOKEN to be set in config/ENV variable.
   To send a Rollbar error message use any (where Error is a javascript Error object):
   logger.error(Error) 
   logger.error(Error, {key: value})
   logger.error(message, {key: value})
   logger.error(message)
   With an Error object Rollbar will capture the stack trace
*/
var RollbarTransport = function(options){
    this.name = "RollBar-Notifications"
    this.level = options.level || 'error';
}
util.inherits(RollbarTransport, winston.Transport)

RollbarTransport.prototype.log = function(level, msg, meta, callback){
    if (meta instanceof Error) {
        rollbar.handleError(meta)
    } else if (msg instanceof Error && meta) {
        rollbar.handleErrorWithPayloadData(msg, {custom:meta})
    } else {
        rollbar.reportMessageWithPayloadData(msg, {custom: meta})
    }
}

logger.add(RollbarTransport, {
    level: "error",
})
/* 
    GOOGLE ANALYTICS LOG TRANSPORT
    This transport sends events to google analytics which can be tracked independently of pageviews
    Events have category, label, action, and value.
 
    To use pass a function to initGoogleAnalytics that returns an object with the fields expected by
    Google Analytics events. These are
    category [required]
    action [required]
    label
    value
    timings
    -- timings will add aditional timing to the reports
       it expects and array of objects with name and timing fields 
       i.e. [{name: 'MuniTime', time: 1023}]
       Total response times are tracked automatically so you shouldn't need to add this

    Category, action, label, should be strings and value should be an integer

*/

function initGoogleAnalytics(initFunction){
    if (!initFunction) return logger.warn("initGoogleAnalytics requires an init function")

    var GATransport = function (options){
        this.name = "Google-Analytics";
        this.level = options.level || 'info';
    }
    util.inherits(GATransport, winston.Transport)

    GATransport.prototype.log = function(level, msg, meta, callback){
        // Don't log HEAD requests to google analytics
        // Without this site checker checks will get logged as page hits
        if (meta.method == "HEAD") return; 

        var _fields = initFunction(meta) || {}

        if (level != 'info') return; // don't send warnings and debug messages to google analytics

        //  To distinguish new and returning users
        var uuid = _fields.uuid || meta.uuid;
        if (!uuid){
            logger.warn("Could not make a UUID for Google Analytics")
        }

        var trackingCode = _fields.trackingCode
        if (!trackingCode) return logger.warn("Google Analytics requires a tracking code")
        var visitor = ua(trackingCode, uuid, {strictCidFormat: false}); //strictCidFormat so GA accepts v5 UUID 
        visitor.set("uid",uuid)

        //Assume plain web hit if no action. At the moment this should only be '/'  and 404s 
        if (!_fields.action) { 
            visitor.pageview(meta.url, (err) => {
                if (err) logger.warn("google analytics error: ", err)
            })
            .send()
            return
        }
        var label = meta.stopId || meta.geocodedAddress || (meta.input ? meta.input.trim().toLowerCase(): "")
        var params = {
            ec: _fields.category,   // category
            ea: _fields.action,     // action
            el: _fields.label,      // label
            ev: _fields.value,      // value
            dp: meta.url,           // page
        }
   
        visitor.event(params, (err) => {
            if (err) logger.warn("google analytics event error: ", err)
        })

        visitor.timing('Response Time', 'Total Time', meta.responseTime )
        if (_fields.timings){
                if (!Array.isArray(_fields.timings)){ 
                    return logger.warn("An array of objects is required to add timings");
                }
                _fields.timings.map((timing_obj) => {
                    visitor.timing("Response Time", timing_obj.name, timing_obj.time )
                })
        }
        visitor.send()
    }
    logger.add(GATransport, {})
}


/*
    SETUP LOGGING MIDDLEWARE
    This will accept a function with a signature:
    initFunction(req, res) 
    and will return a middleware function for use in app.use().
    The initFunction will be passsed the request and response objects.
    It should return an object that defines the names and values
    of what should be logged for example:
    {phonenumber: req.body.From}
    These fields will be merged with the default fields. It is possible to 
    override default fields by passing a value with the same object key as a defaul
*/
function initialize(initFunction){
    return function log(req, res, next){
        var url = req.originalUrl || req.url;
        // don't log requests for static resources - TODO maybe move this to an argument so it can be set from outside
        if (url.startsWith('/css') || url.startsWith('/javascripts')  || url.startsWith('/img')) return next();
        req._startTime = undefined;
        res._startTime = undefined;
        markStartTime.call(req);
        onHeaders(res, markStartTime);
        onFinished(res, (err, res) => {
            var fields = {}
            if (initFunction) {
                fields = initFunction(req, res)
            }
            var routes = res.locals.routes;
            var defaultFields = {
                method:       req.method,
                status:       res.statusCode,
                url:          url,
                ip:           req.connection.remoteAddress,
                timestamp:    new Date().toISOString(),
                responseTime: getResponseTime(req,res),
                uuid:         res.session
            }
            logger.info(Object.assign(defaultFields, fields))

        })
        next();
    }
}
function markStartTime(){
    this._startTime = process.hrtime() // [seconds, nanoseconds]
}
function getResponseTime(req, res){
    if (!res._startTime || !req._startTime) return;
    ms = (res._startTime[0] - req._startTime[0]) * 1e3 + 
         (res._startTime[1] - req._startTime[1]) * 1e-6;
    return ms.toFixed(0);
}

module.exports = logger;
module.exports.initialize = initialize;
module.exports.initGoogleAnalytics = initGoogleAnalytics;