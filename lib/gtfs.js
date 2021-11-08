'use strict';

const logger        = require('./logger')
const fs            = require('fs-extra')
const child_process = require('child_process')
const parse         = require('csv-parse')
const config        = require('./config')
const moment        = require('moment-timezone')
const EventEmitter  = require('events')
const raw_directory = (__dirname + '/../gtfs/raw/')

const muni_URL  = "https://gtfs.muni.org/"
const gtfs_file = config.GTFS_FILE

/* These are the files from the GTFS zip we need to run the app */
const requiredFiles = ['stops.txt', 'calendar_dates.txt']

/**
 * This module is responsible for managing GTFS data. It reads raw GTFS files and parses them into
 * usable data structures. It watches files for changes and can also download new GTFS files.
 * On first run this will load all needed GTFS files and emit 'ready' event on GTFS_Check emitter (useful for tests)
 * @module lib/gtfs
 */

/**
 * Request gtfs zip file and uncompress files.
 * It is scheduled to run periodically in www/bin
 * It should only download the zip files if it has changed on the server
 * @returns {Promise<Boolean>}
 */
function getGTFSFile() {  
    return new Promise((resolve, reject) => {
        const unzipGTFS = function(){
            return child_process.exec(`unzip -o "${raw_directory}${gtfs_file}" -d "${raw_directory}"`, (err, stdout) => {
                console.log("unpacking")
                if (err) {
                    logger.error(err);
                    reject(err);
                } else {
                    resolve(true)
                }
            })
        }
        var curl_process = child_process.exec(`curl ${muni_URL}${gtfs_file} -s -w "%{http_code}" -z "${raw_directory}${gtfs_file}" -o "${raw_directory}${gtfs_file}"`, (err, stdout, stderr) => {
            if (err) {
                logger.error(err);
                return reject(err);
            }
            switch (stdout) {
                case "304":
                    logger.debug("Attempted to download muni GTFS file. File unchanged.");
                    // It's possible for the app to be in a state where the zip files
                    // exists, but never got unpacked. If that's the case, unzip
                    if(requiredFiles.map(f => fs.existsSync(raw_directory + f)).includes(false)) {
                        return unzipGTFS()
                    }
                    resolve(true)
                    break;
                case "200":
                    logger.debug("New GTFS file downloaded")
                    unzipGTFS()
                    // is it possible for this to cause problems with the watched files?
                    break;
                default:
                    logger.error(`Muni Server responded with code ${stdout} when downloading gtfs file`)
                    reject(stdout)
                }
        })
    })
}

/**
* Process raw gtfs csv files, watches them, and reproccess them on changes.
* Error handling:
* On start up if gtfs files can't be read it will throw because the app is broken without them,
* If problems are encountered updating files, a error is sent but app continues with old data
*/
class WatchedFile {
    /**
     * Create a watched file
     * @param {string} Filename - path of file to watch
     */
    constructor(filename) {
        this.filename = filename;
        this.parsed_data = {}
    }
    /**
     * Reads a file and starts watcher
     * @returns {Promise} Resolves once the file is read and parsed
     */
    init(){
        if (fs.existsSync(this.filename)) {
            return this.readfile(true)
            .then(() => {
                fs.watch(this.filename, {persistent: false}, (eventType, filename) => {
                    logger.debug(filename, " updated")
                    setTimeout(this.readfile.bind(this), 1000);
                })
            })
        } else {
            var err = new Error("Can't read gtfs file: " + filename );
            logger.error(err);
            return Promise.reject(err)
        }
    }
    /**
     * Default behavior uses csv-parse's mapping of header row to object keys
     * override this method when different data format is needed
     * @param {*} data
     */
    processFile(data) {
        this.parsed_data = data;
    }
    /**
     * Reads and parses csv files
     * @param {Boolean} first_run - On first run this rejects on error otherwise only logs errors
     * @returns {Promise} resovles when file is parsed
     */
    readfile(first_run = false) {
        return new Promise((resolve, reject) => {
            fs.readFile(this.filename, (err, data) => {
                if (err) {
                    logger.error(err);
                    return first_run ? reject(err) : resolve();
                }
                // The gtfs files have a header row that will be used for object keys
                parse(data, {columns:true, ltrim:true}, (err, output) => {
                    if (err) {
                        logger.error(err);
                        return first_run ? reject(err) : resolve();
                    }
                    this.processFile(output);
                    resolve()
                })
            })
        })
    }
}

/**
 * Creates both all_stops data and the stop_number_lookup
 * @extends WatchedFile
 */
class Stops extends WatchedFile {
    processFile(data) {
        this.parsed_data = {
            type: "FeatureCollection",
            features: data.map((point) => {
                return makeGeoJSONPoint(point)
            })
        }
        this.stop_url = {}
        data.forEach((point) => {
            this.stop_url[parseInt(point.stop_code)] = point.stop_url
        })
    }
}

function makeGeoJSONPoint(point){
    return {
        "type": "Feature",
        "properties": {
            "name": point.stop_name,
            "stop_id": point.stop_code,
            "stop_url": point.stop_url
        },
        "geometry": {
            type: "Point",
            coordinates: [
                parseFloat(point.stop_lon),
                parseFloat(point.stop_lat),
            ]
        }
    }
}

/**
 * Checks if today is a holiday
 * @returns {boolean} true if it is holiday and there's no bus service
 */
function serviceExceptions() {
    // Check for holiday exceptions
    var dateTz = moment.tz(new Date(), config.TIMEZONE).format("YYYYMMDD");
    return exceptions.parsed_data.some(exception => exception.date == dateTz && exception.exception_type == 2 )
}

const all_stops = new Stops(raw_directory+'stops.txt'),
      exceptions = new WatchedFile(raw_directory+'calendar_dates.txt'),
      GTFS_Check = new EventEmitter()

logger.debug("Checking that GTFS files are available ")

fs.ensureDir(raw_directory)
.then(getGTFSFile)
.then(() => Promise.all([all_stops, exceptions].map(i => i.init())))
.then(() => GTFS_Check.emit("ready"))
.catch(err => {
    logger.error(err)
})

module.exports = {
    get all_stops() { return all_stops.parsed_data },
    get exceptions() { return exceptions.parsed_data},
    get stop_number_url() {return all_stops.stop_url },
    serviceExceptions: serviceExceptions,
    getGTFSFile: getGTFSFile,
    GTFS_Check: GTFS_Check
    }
