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
 
    The convention used here is:
    category: 'sms | 'web'
    action: actions are set by the router depending on what the user was looking for
           currently: '[Failed?]Stop Lookup' '[Failed?]Address Lookup', 'Empty Input', 'About', 'Feedback'
    label: the actual search: the stop number, geocoded address, or the raw input if lookup failed

*/

var GATransport = function (options){
    this.name = "Google-Analytics";
    this.level = options.level || 'info';
}
util.inherits(GATransport, winston.Transport)


GATransport.prototype.log = function(level, msg, meta, callback){
    if (level != 'info') return; // don't send warnings and debug messages to analytics

    var category = meta.phone ? "sms" : "web";
    var action = meta.action;

    //  Setup UUID to send to Google Analtyics 
    //  This helps distinguiahsing new and returning users
   if (category == "sms"){
        var ns = "deebee62-076c-47ef-ad02-2509e2d4f839" // namespace is hashed (SHA-1) with phone number to create UUID
        var uuid = new UUID(5, ns, meta.phone).format()
    } else {
        var uuid = meta.uuid;
    }
    if (!uuid){
        logger.warn("could not make a UUID for Google Analytics")
    }

    var visitor = ua(config.GOOGLE_ANALYTICS_ID, uuid, {strictCidFormat: false}); //strictCidFormat so GA accepts v5 UUID 
    visitor.set("uid",uuid)

    if (category == "web" && !meta.action) { //log plain web hits. At the moment this should only be '/'  and 404s 
        visitor.pageview(meta.url, (err) => {
            if (err) logger.warn("google analytics error: ", err)
        })
        .send()
        return
    }
    var label = meta.stopId || meta.geocodedAddress || (meta.input ? meta.input.trim().toLowerCase(): "")
    var params = {
        ec: category, 
        ea: action, 
        el: label,
        ev: meta.responseTime,
        dp: meta.url,       
    }

    visitor.event(params, (err) => {
        if (err) logger.warn("google analytics event error: ", err)
        })
    .timing('Response Time', 'Total Time', meta.responseTime )
    .timing('Response Time', 'Muni Time', meta.muniTime)
    .send()
}

logger.add(GATransport, {})

/*
    LOGGING MIDDLEWARE
    'use' it in express: use(logs) 
    This will send all requests to the tranports above. They can decide whether to write
    them based on level or other criterion. It will start the request timer immediately and
    stop timer and send log when on-finished fires.
*/
function log(req, res, next){
    var url = req.originalUrl || req.url;
    // don't log requests for static resources - maybe move this to an argument so it can be set from outside
    if (url.startsWith('/css') || url.startsWith('/javascripts')  || url.startsWith('/img')) return next();
    req._startTime = undefined;
    res._startTime = undefined;
    markStartTime.call(req);
    onHeaders(res, markStartTime);
    onFinished(res, (err, res) => {
        var routes = res.locals.routes;
        logger.info({
            method:          req.method,
            status:          res.statusCode,
            url:             url,
            ip:              req.connection.remoteAddress,
            timestamp:       new Date().toISOString(),
            input:           req.body.Body,
            phone:           req.body.From,
            responseTime:    getResponseTime(req,res),
            muniTime:        routes ? routes.muniTime: undefined,
            geocodeTime:     routes ? routes.geocodeTime: undefined,
            stopId:          routes ? routes.data.stopId: undefined,
            geocodedAddress: routes ? routes.data.geocodedAddress: undefined,
            action:          res.locals.action,
            uuid:            req.cookies? req.cookies['uuid']: undefined
        })

    })
    next();
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
module.exports.log = log;
module.exports.logger = logger;
module.exports.getLogData = getLogData;