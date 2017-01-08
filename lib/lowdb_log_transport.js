var util = require('util');
var low = require('lowdb');
var db = low('./public/db.json', { storage: require('lowdb/lib/file-async') });
var db_private = low('./db_private.json', { storage: require('lowdb/lib/file-async') });
var moment = require('moment-timezone');
var winston = require('winston');
var hashwords = require('hashwords')();
var config = require('../lib/config');

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
    if (level != 'info') return; // don't send warnings and debug messages to log

    //  Don't log blank input, feedback, or plain pageviews
    var ignore_actions = ['Empty Input', 'Feedback']
    if (!meta.action || ignore_actions.indexOf(meta.action) >= 0) return

    var entry = {
        date            : new Date(), 
        totalTime       : meta.responseTime,
        input           : meta.input, 
        phone           : meta.phone,
        fbUser          : meta.fbUser,
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
    if (entry.fbUser) {
        entry2.fbUser = hashwords.hashStr(entry.fbUser);
    }
    entry2.ip = "";
    db.defaults({ requests: []}).value()
    db.get('requests').push(entry2).value(); 
}

var getLogData =function(daysBack, type){
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
            } else if (point.fbUser) {
                hitType = "fb"
            }
            var outPoint = {};
            outPoint.type = hitType;
            outPoint.date = moment.tz(point.date, config.TIMEZONE).unix();
            outPoint.dateOffset = timezone.offset(outPoint.date*1000)
            outPoint.muniTime = point.muniTime || "";
            outPoint.totalTime = point.totalTime || "";
            outPoint.userId = point.fbUser ? point.fbUser : (point.phone ? "phone" + point.phone : "ip"+point.ip);
            logData.push(outPoint);
        }).value()
    }
    return logData;
}

module.exports = lowdbTransport;
module.exports.getLogData = getLogData;