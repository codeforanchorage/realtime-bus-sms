var winston = require('winston');
var util = require('util');
var ua = require('universal-analytics')
var onFinished = require('on-finished')
var onHeaders = require('on-headers')

var GAC_CLIENT_ID = "UA-88080012-1"
var CONSOLE_LOG_LEVEL = 'debug'

logger = new winston.Logger()

/* Log stuff to console */
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
    var meta = options.meta;
    var logMessage = options.message 
                     ? winston.config.colorize(options.level) + `: ${options.message}`
                     : winston.config.colorize(options.level) + `: ${meta.status} ${meta.ip} ${meta.method} ${meta.url} ${meta.input || ""}`;
    return logMessage
}

//
// Google Analytics Transport 
//
/*
 Things to log:
  lookups that don't return results (i.e. bad stop number or unfound address)
  about request
  feedback
  home page hit
  on web differentiate between direct url hit (ie. 'find/0235') and ajax request
  404 and 5xx errors

  needs a way to identify new and returning users - hash of phone number?

*/   
var GATransport = function (options){
    this.name = "Google-Analytics";
    this.level = options.level || 'info';
}
util.inherits(GATransport, winston.Transport)

/* GOOGLE ANALYTICS LOG TRANSPORT
   This transport sends events to google analytics which can be tracked independently of pageviews
   Events have category, label, action, and value.
   The convention used here is:
   category: 'sms | 'web'
   action: actions are set by the router depending on what the user was looking for
           currently: '[Failed?]Stop Lookup' '[Failed?]Address Lookup', 'Empty Input', 'about'
  label:  the actual search: the stop number, geocoded address, or the raw input if lookup failed
*/


GATransport.prototype.log = function(level, msg, meta, callback){
    if (level != 'info') return; // don't send warnins and debug messages to analytics
    var visitor = ua(GAC_CLIENT_ID);

    var category = meta.phone ? "sms" : "web";
    var action = meta.action;
    if (category == "web" && !meta.action) {
        visitor.pageview(meta.url, (err) => {
            if (err) logger.warn("google analytics error: ", err)
        })
        .send()
        return
    }
    var label = meta.stopId || meta.geocodedAddress || (meta.input ? meta.input.trim().toLowerCase(): "")
    // Google Analytics Events require event categoty (ec) and event action (ea)
    // Other fields are optional
    var params = {
        ec: category, 
        ea: action, 
        el: label,
        dp: meta.url,
    }

    visitor.event(params, (err) => {
        if (err) logger.warn("google analytics error: ", err)
        })
    .timing('Response Time', 'Total Time', meta.responseTime )
    .timing('Response Time', 'Muni Time', meta.muniTime)
    .send()
    console.log("event: ", category, action, label, meta.responseTime, meta.muniTime)
}

logger.add(GATransport, {})

//
// logging middleware 
//
function log(fields){
    this.fields = fields;
 
    return function _write_log(req, res, next){
        var url = req.originalUrl || req.url;
        // don't log requests for static resources
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
                stopId:          routes ? routes.data.stopId : undefined,
                geocodedAddress: routes ? routes.data.geocodedAddress : undefined,
                action:          res.locals.action
        })});
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
module.exports.log = log
module.exports.logger = logger