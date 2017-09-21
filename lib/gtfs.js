const logger = require('./logger');
const fs = require('fs');
const http = require('http');
const exec = require('child_process').exec;
const parse = require('csv-parse');
const raw_directory = (__dirname + '/../gtfs/raw/');
const config = require('./config')
const xml2js = require('xml2js');
const nearest = require('@turf/nearest')
const turf = require('@turf/helpers')

const muni_URL="http://gtfs.muni.org/"
const gtfs_file="People_Mover.gtfs.zip"

/*
* Request gtfs zip file and uncompress files
* This is scheduled to run periodically in www/bin
*/

function getGTFSFile() {
    // This should only download the GTFS file if it has changed on the muni server
    // If there is a new file it should download it and unzip it into the raw directory
    const curl_process = exec(`curl ${muni_URL}${gtfs_file} -s -w "%{http_code}" -z "${raw_directory}${gtfs_file}" -o "${raw_directory}${gtfs_file}"`, (err, stdout, stderr) => {
        if (err) {
            logger.error(err);
            return;
        }
        switch (stdout) {
            case "304":
                logger.debug("Attempted to download muni GTFS file. File unchanged.");
                break;
            case "200":
                logger.debug("New GTFS file downloaded")
                let zip_process = exec(`unzip -uo "${raw_directory}${gtfs_file}"  -d "${raw_directory}"`)
                // is it possible for this to cause problems with the watched files?
                break;
            default:
                logger.error(`Muni Server responded with code ${stdout} when downloading gtfs file`)
            }
    })
}

/*
* Process raw gtfs txt files and reprocess on changes
*/
    // Error handling
    // On start up if gtfs files can't be read it will throw because the app is broken without them,
    // If problems are encountered updating files, a error is sent but app continues with old data

class WatchedFile {
    // This class will read and process the file passed in the constructor and watch it
    // on change it will re-read and re-process the file.
    // Processed data available in .parsed_data by default
    constructor(filename) {
        this.filename = filename;
        this.parsed_data = {}
        if (fs.existsSync(this.filename)) {
            this.readfile(true);
            fs.watch(this.filename, {persistent: false}, (eventType, filename) => {
                logger.debug(filename, " changed")
                this.readfile();
           });
        } else {
            const err = new Error("Can't read gtfs file: " + filename );
            logger.error(err);
            throw(err)
        }
    }

    processFile(data) {
        // default uses csv-parse's mapping of header row to object keys
        // override this method when different data format is needed
        this.parsed_data = data;
    }

    readfile(first_run = false) {
        // if first_run is true, this will throw on errors
        fs.readFile(this.filename, (err, data) => {
            if (err) {
                logger.error(err);
                if (first_run) throw(err)
                return;
            }
            // parse csv from gtfs text files
            // the gtfs files have a header row that will be used for object keys
            parse(data, {columns:true}, (err, output) => {
                if (err) {
                    logger.error(err);
                    if (first_run) throw(err)
                    return;
                }
                this.processFile(output);
            })
        })
    }
}

class Stops extends WatchedFile {
    constructor(filename){
        super(filename)
        this.stop_lookup = {}
        this.parsed_data = {
            type: "FeatureCollection",
            features:[]
        }
    }
    /* Creates both all_stops data
       and the stop_number_lookup  */

    processFile(data) {
        /* get xml file with bustracker stops */
        var parser = new xml2js.Parser();
        getHTTP(config.MUNI_STOPS_URL)
        .then(xml => {
            parser.parseString(xml,  (err, result) => {
                if (err) {
                    logger.error(err)
                    if (first_run) throw(err)
                    return
                }
                let points = result.stops.stop.map(stop => turf.point([+stop.longitude, +stop.latitude], {id: stop.id[0]}))
                let muni_stops = turf.featureCollection(points)
                data.forEach((point) => {
                    this.parsed_data.features.push(makeGeoJSONPoint(point))
                    let closest_muni_stop = nearest(turf.point([+point.stop_lon, +point.stop_lat]), muni_stops)
                    this.stop_lookup[parseInt(point.stop_id, 10)] = parseInt(closest_muni_stop.properties.id, 10)
                })
            })
        })
        .catch(err => {
            logger.error(err)
            if (first_run) throw(err)
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

function getHTTP(url) {
    return new Promise((resolve, reject) =>{
        const request = http.get(url, response => {
            if (response.statusCode < 200 || response.statusCode > 299) {
                reject(new Error("Can't get muni stop xml file"))
            }
            let xml = '';
            response.on('data', chunk => xml += chunk)
            response.on('end', () => resolve(xml))
        })
        request.on('error', err => reject(err))
    })
}

const all_stops = new Stops(raw_directory+'stops.txt')
const exceptions = new WatchedFile(raw_directory+'calendar_dates.txt');
const routes = new Routes(raw_directory+'routes.txt')

module.exports = {
    get all_stops() { return all_stops.parsed_data },
    get exceptions() { return exceptions.parsed_data},
    get stop_number_lookup() {return all_stops.stop_lookup },
    get routeNamesToRouteNumbers() {return routes.parsed_data},
    getGTFSFile: getGTFSFile
    }



