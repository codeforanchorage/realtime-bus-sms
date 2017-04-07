var logger = require('./logger')
var fs = require('fs');
var parse = require('csv-parse');

var raw_directory = (__dirname + '/../gtfs/raw/');

class WatchedFile {
    // This class will read and process the file passed in the constructor and watch it
    // on changes it will re-read and re-process the file. 
    // Processed data available in .parsed_data by default
    constructor(filename) {
        this.filename = filename;
        this.parsed_data = {}
        if (fs.existsSync(this.filename)) {
            this.readfile();
            fs.watch(this.filename, (eventType, filename) => {
                console.log(filename, " changed")
                this.readfile();
            });
        } else {
            var err = new Error("Can't read gtfs file: " + filename );
            logger.error(err);
            throw(err)
        }
    }   
    processFile(data) {
        // default uses csv-parse's mapping of header row to object keys
        // override this method when different data format is needed 
        this.parsed_data = data;
    }

    readfile() {
        fs.readFile(this.filename, (err, data) => {  
            if (err) {
                logger.error(err);
                throw(err);
            }
            // parse csv from gtfs text files 
            // the gtfs files have a header row that will be used for object keys
            parse(data, {columns:true}, (err, output) => {
                // use better logging/rollbar here
                if (err) {
                    logger.error(err)
                    throw err;
                }
                this.processFile(output)
            });
        }); 
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

var all_stops = new Stops(raw_directory+'stops.txt')
var exceptions = new WatchedFile(raw_directory+'calendar_dates.txt');
var routes = new Routes(raw_directory+'routes.txt')

var gtfs = {
    get all_stops() { return all_stops.parsed_data },
    get exceptions() { return exceptions.parsed_data}, 
    get stop_number_lookup() {return all_stops.stop_lookup },
    get routeNamesToRouteNumbers() {return routes.parsed_data}
}

module.exports = gtfs;

