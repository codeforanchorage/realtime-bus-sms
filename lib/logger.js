'use strict';

const winston             = require('winston')
const { combine, timestamp, label, printf } = winston.format
const { format }          = require('logform')

const Transport           = require('winston-transport')
const ua                  = require('universal-analytics')
const onFinished          = require('on-finished')
const util                = require('util')
const onHeaders           = require('on-headers')
const UUID                = require("pure-uuid")
const CONSOLE_LOG_LEVEL   = 'debug'
const config              = require('./config')
const Rollbar             = require('rollbar');
const rollbar             = new Rollbar(config.ROLLBAR_TOKEN)
const hashwords           = require('hashwords')()

const PUBLIC_LOG_PATH = 'access_public.log'
const PRIVATE_LOG_PATH = 'access_private.log'

/**
 * Winston-based logger
 *
 * CONSOLE LOGGING
 * This will log any request to the console greater than CONSOLE_LOG_LEVEL
 * The levels are by default NPM's logging levels:
 * error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5
 * When CONSOLE_LOG_LEVEL is set to 'info' it will write all messages
 * with levels error, warn, and info.
 * You can add debug code with:
 * logger.debug(message), which will only show in transports that want it.
 * 
 * FILE LOGGING
 * Logs to two files which are identical except the public file has encrytped phone
 * numbers. Set PUBLIC_LOG_PATH and PRIVATE_LOG_PATH to specify file locations 
 * 
 */


const fileformat = format((info, opt) => {
   if (info.level != 'info' || this.silent ) return false
   let {uuid, message, level, ...rest} = info
   if (opt.private && rest.phone) {
      rest.phone =  hashwords.hashStr(rest.phone)
   }
   return  rest
})

const logger = new winston.createLogger({
   transports: [
      new winston.transports.Console({
         name: 'console-log',
         level: CONSOLE_LOG_LEVEL,
         format:combine(
            winston.format.colorize(),
            winston.format.timestamp({
               format: 'YYYY-MM-DD HH:mm:ss'
             }),
            winston.format.printf(info => 
               `${info.level}: ${info.message} ${info.timestamp} ${info.url || ''} ${info.input || ""}`
            )
         )
      }),
      new winston.transports.File({ 
         name: "public-log-file",
         filename: PUBLIC_LOG_PATH, 
         level: 'info',
         format:combine(
            winston.format.timestamp({
               format: 'YYYY-MM-DD HH:mm:ss'
             }),
             fileformat({private: false}),
             winston.format.json()
         )     
      }),
      new winston.transports.File({ 
         name: "private-log-file",
         filename: PRIVATE_LOG_PATH, 
         level: 'info',
         format:combine(
            winston.format.timestamp({
               format: 'YYYY-MM-DD HH:mm:ss'
             }),
             fileformat({private: true}),
             winston.format.json()
         )     
      })
   ]
});

/**
 * ROLLBAR ERROR LOGGING
 * This transport will allow sending messages with logging level of error directly to rollbar.
 * It will require a ROLLBAR_TOKEN to be set in config/ENV variable.
 * To send a Rollbar error message use any (where Error is a javascript Error object):
 * logger.error(Error)
 * logger.error(Error, {key: value})
 * logger.error(message, {key: value})
 * logger.error(message)
 * With an Error object Rollbar will capture the stack trace
 * @param {*} options
 */
class RollbarTransport extends Transport{
    constructor(opts){
        super({
            name: "RollBar-Notifications", 
            level: opts.level ||'error' 
        })
    }
    log(level, msg, meta, callback) {
        if (meta instanceof Error) {
            rollbar.error(meta)
        } else if (meta) {
            // Winston makes objects passed to msg strings, so this probaby never gets called
            rollbar.error(msg, null, {custom:meta})
        } else {
            rollbar.error(msg)
        }
        callback(null, true)    
    }
}


//logger.add(new RollbarTransport({level: 'error'}))

/**
 * GOOGLE ANALYTICS LOG TRANSPORT
 * This transport sends events to google analytics which can be tracked independently of pageviews
 * Events have category, label, action, and value.
 *
 * To use pass a function to initGoogleAnalytics that returns an object with the fields expected by
 * Google Analytics events.
 * These are
 * category [required]
 * action [required]
 * label
 * value
 * timings
 * -- timings will add aditional timing to the reports
 *    it expects and array of objects with name and timing fields
 *    i.e. [{name: 'MuniTime', time: 1023}]
 *    Total response times are tracked automatically so you shouldn't need to add this
 *
 * Category, action, label, should be strings and value should be an integer
 * @param {*} initFunction function that returns an object with expected fields
 */

function initGoogleAnalytics(initFunction){
    if (!initFunction) return logger.warn("initGoogleAnalytics requires an init function")

    class GATransport extends Transport{
        constructor(opts){
            super({
                name: "Google-Analytics", 
                level: opts.level ||'info' 
            })
        }
        log(level, msg, meta, callback){
            // Allow silent mode - nice for running tests without writing logs
            if (this.silent) return callback(null, true);
    
            // Don't log HEAD requests to google analytics without this site checker checks will get logged as page hits
            if (meta.method == "HEAD") return callback(null, true);
    
            const _fields = initFunction(meta) || {}
            // Don't send warnings and debug messages to google analytics
            if (level != 'info') return callback(null, true);
    
            //  To distinguish new and returning users
            const uuid = _fields.uuid || meta.uuid;
            if (!uuid){
                logger.warn("Could not make a UUID for Google Analytics")
            }
    
            const trackingCode = _fields.trackingCode
            if (!trackingCode) {
                callback(null, true)
                return logger.warn("Google Analytics requires a tracking code")
            }
            const visitor = ua(trackingCode, uuid, {strictCidFormat: false}); //strictCidFormat so GA accepts v5 UUID
            visitor.set("uid",uuid)
    
            //Assume plain web hit if no action. At the moment this should only be '/'  and 404s
            if (!_fields.action) {
                visitor.pageview(meta.url, (err, res) => {
                    if (err) {
                        logger.warn("google analytics error: ", err)
                        callback(err)
                    } else {
                        callback(null, true)
                    }
                })
                .send()
                return
            }
            const params = {
                ec: _fields.category,   // category
                ea: _fields.action,     // action
                el: _fields.label,      // label
                ev: _fields.value,      // value
                dp: meta.url,           // page
            }
    
            visitor.event(params, (err, res) => {
                if (err) {
                    logger.warn("google analytics event error: ", err)
                    callback(err)
                } else {
                    callback(null, true)
                }
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
    
    }


   // logger.add(new GATransport({level: 'info'}))

}


/**
 * SETUP LOGGING MIDDLEWARE
 * is will accept a function with a signature:
 * initFunction(req, res)
 * and will return a middleware function for use in app.use().
 * The initFunction will be passsed the request and response objects.
 * It should return an object that maps the names and values
 * of what should be logged for example:
 * {phonenumber: req.body.From}
 * These fields will be merged with the default fields. It is possible to
 * override default fields by passing a value with the same object key as a default
 * @param {*} initFunction
 */
function initialize(initFunction){
    return function log(req, res, next){
        const url = req.originalUrl || req.url;
        // Don't log requests for static resources - TODO maybe move this to an argument so it can be set from outside
        if (url.startsWith('/css') || url.startsWith('/javascripts')  || url.startsWith('/img')) return next();
        // Don't log requests from Elastic loadbalancer health check
        if (req.get('user-agent') && req.get('user-agent').startsWith('ELB-HealthChecker')) return next();

        req._startTime = undefined;
        res._startTime = undefined;
        markStartTime.call(req);
        onHeaders(res, markStartTime);
        onFinished(res, (err, res) => {
            const fields = initFunction ? initFunction(req, res) : {}
            const routes = res.locals.routes;
            const defaultFields = {
                method:       req.method,
                status:       res.statusCode,
                url:          url,
                ip:           req.ip,
                timestamp:    new Date().toISOString(),
                responseTime: getResponseTime(req,res),
                uuid:         res.session
            }

            logger.info(req.method, Object.assign(defaultFields, fields))
        })
        next();
    }
}
function markStartTime(){
    this._startTime = process.hrtime() // [seconds, nanoseconds]
}
function getResponseTime(req, res){
    if (!res._startTime || !req._startTime) return;
    const ms = (res._startTime[0] - req._startTime[0]) * 1e3 +
         (res._startTime[1] - req._startTime[1]) * 1e-6;
    return Math.round(ms)
}

module.exports = logger;
module.exports.initialize = initialize;
module.exports.initGoogleAnalytics = initGoogleAnalytics;