var winston = require('winston');
var util = require('util');
var ua = require('universal-analytics')
var onFinished = require('on-finished')
var onHeaders = require('on-headers')

var GAC_CLIENT_ID = "UA-88080012-1"

logTransport = new winston.Logger()

/* Log stuff to console */
logTransport.add(winston.transports.Console, {
    colorize: true,
    showLevel: true,
    level: 'debug',
    formatter: consoleFormatter
   // json: true,
})

function consoleFormatter(options){
    var meta = options.meta;
    return winston.config.colorize(options.level) + `: ${meta.status} ${meta.ip} ${meta.method} ${meta.url} ${meta.input || ""}`;
}

//
// Google Analytics Transport 
//
var GATransport = function (options){
    this.name = "Google-Analytics";
    this.level = options.level || 'info';
}
util.inherits(GATransport, winston.Transport)

/* GA Events expect a ec->event category, ea -> event action, el->event label,ev -> event value
   ec and ea ara manditory */
/*
 Things to log:
  lookups that don't return results (i.e. bad stop number or unfound address)
  about request
  feedback
  home page hit
  on web differentiate between direct url hit (ie. 'find/0235') and ajax request
  404 and 5xx errors

*/   
GATransport.prototype.log = function(level, msg, meta, callback){
    //console.log("in GA log", level, msg, meta);
    //callback(null, true)
    var category = meta.phone ? "sms" : "web";
    var action = undefined;
    var value = undefined;
    action = meta.action || "other";
    label = meta.stopId || meta.geocodedAddress || (meta.input ? meta.input.trim().toLowerCase(): "")
    var params = {
        ec: category, 
        ea: action,
        el: label,
        dp: meta.url,
        cm1: meta.responseTime
    }

    var visitor = ua(GAC_CLIENT_ID);
    visitor.event(params, (err) => {
        if (err) console.log("google analytics error: ", err)
        })
    .timing('Response Time', 'Total Time', meta.responseTime )
    .timing('Response Time', 'Muni Time', meta.muniTime)
    .send()
    console.log("event: ", category, action, label, meta.responseTime, meta.muniTime)
}

logTransport.add(GATransport, {})

//
// logging middleware 
//
function log(fields){
    this.fields = fields;
 
    return function logger(req, res, next){
        var url = req.originalUrl || req.url;
        // don't log requests for static resources
        if (url.startsWith('/css') || url.startsWith('/javascripts')  || url.startsWith('/img')) return next();

        req._startTime = undefined;
        res._startTime = undefined;

        markStartTime.call(req);
        onHeaders(res, markStartTime);
        onFinished(res, (err, res) => {
            var routes = res.locals.routes;
            logTransport.info({
                method: req.method,
                status: res.statusCode,
                url: url,
                ip: req.connection.remoteAddress,
                timestamp: new Date().toISOString(),
                input: req.body.Body,
                phone: req.body.From,
                responseTime: getResponseTime(req,res),
                muniTime: routes ? routes.muniTime: undefined,
                geocodeTime: routes ? routes.geocodeTime: undefined,
                stopId: routes ? routes.data.stopId : undefined,
                geocodedAddress: routes ? routes.data.geocodedAddress : undefined,
                action: res.locals.action
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
module.exports = log