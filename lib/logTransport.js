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
    return winston.config.colorize(options.level) + `: ${meta.ip} ${meta.method} ${meta.url} ${meta.input || ""}`;
}


/* Google Analytics Transport */
var GATransport = function (options){
    this.name = "Google-Analytics";
    this.level = options.level || 'info';
}
util.inherits(GATransport, winston.Transport)

/* GA Events expect a ec->event category, ea -> event action, el->event label,ev -> event value
   ec and ea ara manditory */
GATransport.prototype.log = function(level, msg, meta, callback){
    //console.log("in GA log", level, msg, meta);
    //callback(null, true)
    var category = meta.phone ? "sms" : "web";
    var action = undefined;
    var value = undefined;
    if (meta.stopId) {
        action = 'stopLookup';
        label = meta.stopId;
    } else if (meta.geocodedAddress){
        action = 'addressLookup';
        label = meta.geocodedAddress;
    } else {
        action = 'other'
        label = meta.input.trim().toLowerCase()
    }
    var params = {
        ec: category, 
        ea: action,
        el: label,
        dp: meta.url
    }

    var visitor = ua(GAC_CLIENT_ID);
    visitor.event(params, (err) => {
        if (err) console.log("google analytics error: ", err)
        }).send()
    console.log("event: ", category, action, label)
}

logTransport.add(GATransport, {})

function log(fields){
    this.fields = fields;

    /* logging middleware */
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
                url: url,
                ip: req.connection.remoteAddress,
                timestamp: new Date().toISOString(),
                input: req.body.Body,
                phone: req.body.From,
                responseTime: getResponseTime(req,res),
                muniTime: routes ? routes.muniTime: undefined,
                geocodeTime: routes ? routes.geocodeTime: undefined,
                stopId: routes ? routes.data.stopId : undefined,
                geocodedAddress: routes ? routes.data.geocodedAddress : undefined
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
    return ms.toFixed(3);
}
module.exports = log