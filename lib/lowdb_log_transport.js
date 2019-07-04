'use strict';

const util        = require('util')
const low         = require('lowdb')
const FileASync = require('lowdb/adapters/FileASync')

const moment      = require('moment-timezone')
const winston     = require('winston')
const hashwords   = require('hashwords')()
const config      = require('../lib/config')

const db_path = './public/db.json'
const db_private_path =  './db_private.json'

/**
 * Winston log trasport to write to lodBD.
 * This writes local json formatted logs that can be querried using using lodash operators.
 * It reads the entire file into memory so for reads and writes to stay in sync you need to
 * use the same handle.
 * @module lib/lowdb_log_transport
 */

/**
 * Create winston transport.
 * @param {string} public_file  - Path to public log file
 * @param {string} private_file - Path to private log file
 */
function transport(public_file = db_path, private_file = db_private_path ){
    // Returning a function makes it possble to save logs to files other than the default
    // which is especially handy for tests.
    
    const db = low(new FileASync(public_file));
    const db_private = low(new FileASync(private_file));

    const lowdbTransport = function(options){
        this.name = "File-Logs";
        this.level = options.level || 'info';
    }

    util.inherits(lowdbTransport, winston.Transport);

    lowdbTransport.prototype.log = function(level, msg, meta, callback) {
        if (level != 'info') return callback(null, true); // don't send warnings and debug messages to log
        if (this.silent) return callback(null, true);    // allow silent mode - nice for running tests without writing logs

        //  Don't log blank input, feedback, or plain pageviews
        const ignore_actions = ['Empty Input', 'Feedback']
        if (!meta.action || ignore_actions.indexOf(meta.action) >= 0) return callback(null, true)

        const entry = {
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
        const entry2 = Object.assign({}, entry);
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

/**
 * Get logging data for daysBack days. Used to produce hits graph
 * @param {number} daysBack     - Number of days to retrieve
 * @param {string} type         - Type of event to get. Currently only 'hits'
 * @param {string} private_file - Path to log file
 */
function getLogData(daysBack, type, private_file = db_private_path){
    const db_private = low(private_file, { storage: require('lowdb/lib/storages/file-async') });
    const logData = [];
    const timezone = moment.tz.zone(config.TIMEZONE);
    if (type == "hits") {
        const data = db_private.get('requests').value();
        let dateTz = null;
        const nowTz = moment.tz(new Date(), config.TIMEZONE);
        let index = data.length - 1; // start at the newest record

        while(index > -1) {
            let point = data[index]

            if (point.date) {
                dateTz = moment.tz(point.date, config.TIMEZONE);
                // make sure the record is not too old
                if (moment.duration(nowTz.diff(dateTz)).asDays() <= daysBack) {
                    let hitType = "browser";
                    if (point.phone) {
                        hitType = "sms"
                    } else if (point.fbUser) {
                        hitType = "fb"
                    }
                    const outPoint = {};
                    outPoint.type = hitType;
                    outPoint.date = moment.tz(point.date, config.TIMEZONE).unix();
                    outPoint.dateOffset = timezone.offset(outPoint.date*1000)
                    outPoint.muniTime = point.muniTime || "";
                    outPoint.totalTime = point.totalTime || "";
                    outPoint.userId = point.fbUser ? point.fbUser : (point.phone ? "phone" + point.phone : "ip"+point.ip);
                    logData.push(outPoint);
                }
                else {
                    index = -1; // the requests have gotten too old. break out of the loop
                }
            }

            // decrement the index to get to the next oldest record
            index--
        }
    }
    return logData;
}
module.exports = transport;
module.exports.getLogData = getLogData;
