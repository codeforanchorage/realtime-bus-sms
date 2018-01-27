const logger = require('./logger'),
      fs = require('fs-extra'),
      child_process = require('child_process'),
      parse = require('csv-parse'),
      request = require('request'),
      moment = require('moment-timezone'),
      EventEmitter = require('events'),
      raw_directory = (__dirname + '/../gtfs/raw/'),
      muni_URL="http://gtfs.muni.org/",
      gtfs_file="People_Mover.gtfs.zip"


/*
* Request gtfs zip file and uncompress files
* This is scheduled to run periodically in www/bin
*/

function getGTFSFile() {
    // This should only download the GTFS file if it has changed on the muni server
    // If there is a new file it should download it and unzip it into the raw directory
    return new Promise((resolve, reject) => {
        var curl_process = child_process.exec(`curl ${muni_URL}${gtfs_file} -s -w "%{http_code}" -z "${raw_directory}${gtfs_file}" -o "${raw_directory}${gtfs_file}"`, (err, stdout, stderr) => {
            if (err) {
                logger.error(err);
                return reject(err);
            }
            switch (stdout) {
                case "304":
                    logger.debug("Attempted to download muni GTFS file. File unchanged.");
                    resolve(true)
                    break;
                case "200":
                    logger.debug("New GTFS file downloaded")
                    var zip_process = child_process.exec(`unzip -o "${raw_directory}${gtfs_file}" -d "${raw_directory}"`, (err, stdout) => {
                        if (err) {
                            logger.error(err);
                            reject(err);
                        } else {
                            resolve(true)
                        }
                    })
                    // is it possible for this to cause problems with the watched files?
                    break;
                default:
                    logger.error(`Muni Server responded with code ${stdout} when downloading gtfs file`)
                    reject(stdout)
                }
        })
    })
}

/*
* Process raw gtfs txt files and reprocess on changes
*/
    // Error handling
    // On start up if gtfs files can't be read it will throw because the app is broken without them,
    // If problems are encountered updating files, a error is sent but app continues with old data

class WatchedFile {
    /* This class will read and process the file passed in the constructor and watch it.
       On change it will re-read and re-process the file.
       Processed data available in .parsed_data by default
    */
    constructor(filename) {
        this.filename = filename;
        this.parsed_data = {}
    }
    init(){
        // Returns a promise that resolves once file is read and parsed
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
    processFile(data) {
        // default uses csv-parse's mapping of header row to object keys
        // override this method when different data format is needed
        this.parsed_data = data;
    }

    readfile(first_run = false) {
        // if first_run is true, this will reject with error, but otherwise will use existing data
        return new Promise((resolve, reject) => {
            fs.readFile(this.filename, (err, data) => {
                if (err) {
                    logger.error(err);
                    return first_run ? reject(err) : resolve();
                }
                // parse csv from gtfs text files
                // the gtfs files have a header row that will be used for object keys
                parse(data, {columns:true}, (err, output) => {
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

class Stops extends WatchedFile {
    // Creates both all_stops data
    // and the stop_number_lookup
    processFile(data) {
        this.parsed_data = {
            type: "FeatureCollection",
            features: data.map((point) => {
                return makeGeoJSONPoint(point)
            })
        }
        this.stop_lookup = {}
        data.forEach((point) => {
            this.stop_lookup[parseInt(point.stop_id)] = parseInt(point.bt_id)
        })
    }
}

class Routes extends WatchedFile {
    processFile(data) {
        data.forEach((point) => {
            this.parsed_data[point.route_long_name] = parseInt(point.route_id)
        })
    }
}

function makeGeoJSONPoint(point){
    return {
        "type": "Feature",
        "properties": {
            "name": point.stop_name,
            "stop_id": point.stop_id,
            "stop_code": point.bt_id
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
 * Checks that GTFS directory is there and has files necessary to run app
 * It will emit on GTFS_Check if eveything once everything is initialized
 */

const all_stops = new Stops(raw_directory+'stops.txt'),
      exceptions = new WatchedFile(raw_directory+'calendar_dates.txt'),
      routes = new Routes(raw_directory+'routes.txt')
      GTFS_Check = new EventEmitter()
logger.debug("Checking that GTFS files are available ")

fs.ensureDir(raw_directory)
.then(getGTFSFile)
.then(() => Promise.all([all_stops, exceptions, routes].map(i=>i.init())))
.then(() => GTFS_Check.emit("ready"))
.catch(err => {
    logger.error(err)
})

function serviceExceptions() {
    // Check for holiday exceptions
    var dateTz = moment.tz(new Date(), config.TIMEZONE).format("YYYYMMDD");
    return exceptions.parsed_data.some(exception => exception.date == dateTz && exception.exception_type == 2 )
}

module.exports = {
    get all_stops() { return all_stops.parsed_data },
    get exceptions() { return exceptions.parsed_data},
    get stop_number_lookup() {return all_stops.stop_lookup },
    get routeNamesToRouteNumbers() {return routes.parsed_data},
    serviceExceptions: serviceExceptions,
    getGTFSFile: getGTFSFile,
    GTFS_Check: GTFS_Check
    }


