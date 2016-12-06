var config = require('../lib/config');
var winston = require('winston');
var ua = require('universal-analytics')
var onFinished = require('on-finished')
var util = require('util');
var onHeaders = require('on-headers');
var hashwords = require('hashwords')();
var low = require('lowdb');
var db = low('./public/db.json', { storage: require('lowdb/lib/file-async') });
var db_private = low('./db_private.json', { storage: require('lowdb/lib/file-async') });
var moment = require('moment-timezone');
var UUID = require("pure-uuid");

var CONSOLE_LOG_LEVEL = 'debug';

logger = new winston.Logger();

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
    // Send messages if they exist and also send formatted logger that logs all requests to info
    // Messages will usually be debug or warnings (to send message to console use logger.debug(message) ) 
    // We only want custom format for the auto-logging. When called with logger.debug("message", args) it should
    // act like console.log but with a colorized level indication
    var meta = options.meta;
    var logMessage = (meta && 'status' in meta) 
                     ? winston.config.colorize(options.level) + `: ${meta.status} ${meta.ip} ${meta.method} ${meta.url} ${meta.input || ""}`
                     : winston.config.colorize(options.level) + `: ${options.message}` + (options.meta && Object.keys(options.meta).length ? JSON.stringify(options.meta,  null, '  ') : '' );
                     
    return logMessage
}

/* 
    lowDB LOGGING
    This writes local json formatted logs that can be querried using using lodash operators
    It reads the entire file into memory so or reads and writes to stay in sync you need to
    use the same handle. 

*/
var lowdbTransport = function (options){
    this.name = "Local-Logs";
    this.level = options.level || 'info';
}

util.inherits(lowdbTransport, winston.Transport);

lowdbTransport.prototype.log = function(level, msg, meta, callback) {
    if (level != 'info') return; // don't send warnins and debug messages to analytics
    var entry = {
        date            : new Date(), 
        totalTime       : meta.responseTime,
        input           : meta.input, 
        phone           : meta.phone,
        ip              : meta.ip,
        stop            : meta.stopId,
        geocodedAddress : meta.geocodedAddress,
        muniTime        : meta.muniTime,
        geocodeTime     : meta.geocodeTime
    }
    db_private.defaults({ requests: []}).value()
    db_private.get('requests').push(entry).value();
    var entry2 = JSON.parse(JSON.stringify(entry)); // Required because of async mode of lowdb
    if (entry.phone) {
        entry2.phone = hashwords.hashStr(entry.phone);
    }
    entry2.ip = "";
    db.defaults({ requests: []}).value()
    db.get('requests').push(entry2).value(); 
}
logger.add(lowdbTransport, {})

//     NOTE: this code was moved out of routes/index.js into getLogData so we could use the same 
//    handler from low('./db_private.json') without having to export just the handlerIf you call
//    low() in two different places you get two different in-memory versions of the same File.

function getLogData(daysBack, type){
    var logData = [];
    var timezone = moment.tz.zone(config.TIMEZONE);
    if (type == "hits") {      
        var dateTz = null;
        db_private.get('requests').filter(function(point) {
            if (point.date) {
                var nowTz = moment.tz(new Date(), config.TIMEZONE);
                dateTz = moment.tz(point.date, config.TIMEZONE);
                if (moment.duration(nowTz.diff(dateTz)).asDays() <= daysBack) {
                    return true;
                }
            }
            return false;
        }).forEach(function(point) {
            var hitType = "browser";
            if (point.phone) {
                hitType = "sms"
            }
            var outPoint = {};
            outPoint.type = hitType;
            outPoint.date = moment.tz(point.date, config.TIMEZONE).unix();
            outPoint.dateOffset = timezone.offset(outPoint.date*1000)
            outPoint.muniTime = point.muniTime || "";
            outPoint.totalTime = point.totalTime || "";
            outPoint.userId = point.phone ? "phone" + point.phone : "ip"+point.ip;
            logData.push(outPoint);
        }).value()
    }
    return logData;
}

  
/* 
    GOOGLE ANALYTICS LOG TRANSPORT
    This transport sends events to google analytics which can be tracked independently of pageviews
    Events have category, label, action, and value.
 
    To use call pass a function to initGoogleAnalytics that returns an object with the fields expected by
    Google Analytics events. These are
    category [required]
    action [required]
    label
    value
    timings
    -- timings will add aditional timing to the reports
       it expects and array of objects with name and timing fields 
       i.e. [{name: 'MuniTime', time: 1023}]
       Total response times are tracked automatically so you should need to add this

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
        var _fields = initFunction(meta) || {}
        logger.debug("muni time: ", _fields.muniTime)

        if (level != 'info') return; // don't send warnings and debug messages to analytics

        //  To distinguiahsing new and returning users
        var uuid = _fields.uuid || meta.uuid;
        if (!uuid){
            logger.warn("Could not make a UUID for Google Analytics")
        }

        var trackingCode = _fields.trackingCode
        if (!trackingCode) return logger.warn("Google Analytics requires a tracking code")
        var visitor = ua(trackingCode, uuid, {strictCidFormat: false}).debug(); //strictCidFormat so GA accepts v5 UUID 
        visitor.set("uid",uuid)

        if (!_fields.action) { //Assume plain web hit if no action. At the moment this should only be '/'  and 404s 
            visitor.pageview(meta.url, (err) => {
                if (err) logger.warn("google analytics error: ", err)
            })
            .send()
            return
        }
        var label = meta.stopId || meta.geocodedAddress || (meta.input ? meta.input.trim().toLowerCase(): "")
        var params = {
            ec: _fields.category, 
            ea: _fields.action, 
            el: _fields.label,
            ev: _fields.value,
            dp: meta.url,       
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
    and it will return a middleware function.
    The initFunction will be passsed the request and response object when the request
    is finished. It should return an object that defines which the names and values
    of what should be logged for example:
    {phonenumber: req.body.From}
    These fields will be merged with the default fields. It is possible to 
    override default fields by passing the same object key
*/
function initialize(initFunction){
    return function log(req, res, next){
        var url = req.originalUrl || req.url;
        // don't log requests for static resources - maybe move this to an argument so it can be set from outside
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
                uuid:         req.cookies? req.cookies['uuid']: undefined
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
module.exports.logger = logger;
module.exports.initialize = initialize;
module.exports.getLogData = getLogData;
module.exports.initGoogleAnalytics = initGoogleAnalytics;