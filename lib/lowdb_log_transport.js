var util = require('util');
var low = require('lowdb');
var moment = require('moment-timezone');
var winston = require('winston');
var hashwords = require('hashwords')();
var config = require('../lib/config');

/*
    lowDB LOGGING
    This writes local json formatted logs that can be querried using using lodash operators
    It reads the entire file into memory so for reads and writes to stay in sync you need to
    use the same handle.
*/


function transport(public_file = './public/db.json', private_file = './db_private.json' ){
    // Returning a function makes it possble to save logs to files other than the default
    //   which is especially handy for tests.

        var db = low(public_file, { storage: require('lowdb/lib/storages/file-async') });
        var db_private = low(private_file, { storage: require('lowdb/lib/storages/file-async') });

        var lowdbTransport = function (options){
            this.name = "File-Logs";
            this.level = options.level || 'info';
        }

        util.inherits(lowdbTransport, winston.Transport);

      lowdbTransport.prototype.log = function(level, msg, meta, callback) {
        if (level != 'info') return callback(null, true); // don't send warnings and debug messages to log
        if (this.silent) return callback(null, true);    // allow silent mode - nice for running tests without writing logs

        //  Don't log blank input, feedback, or plain pageviews
        var ignore_actions = ['Empty Input', 'Feedback']
        if (!meta.action || ignore_actions.indexOf(meta.action) >= 0) return callback(null, true)

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
        //write is asynchronous so we copy the object to avoid overwriting it before write
        var entry2 = Object.assign({}, entry);
        if (entry.phone) entry2.phone = hashwords.hashStr(entry.phone);
        if (entry.fbUser) entry2.fbUser = hashwords.hashStr(entry.fbUser);
        delete entry2.ip;
        Promise.all([
            db_private.defaults({ requests: []}) .get('requests').push(entry).write(),
            db.defaults({ requests: []}).get('requests').push(entry2).write()
        ]).then(() => callback(null, true))
    }
    return lowdbTransport
}
var getLogData =function(daysBack, type, private_file = './db_private.json' ){
    var db_private = low(private_file, { storage: require('lowdb/lib/storages/file-async') });
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

module.exports = transport;
module.exports.getLogData = getLogData;