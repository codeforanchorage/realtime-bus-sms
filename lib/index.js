/* TODO
logging
authenticate that requests are from twilio
use express middleware
*/

var request = require('request')
var http = require('http')
var querystring = require('querystring')
var stop_number_lookup = require('./stop_number_lookup')
//var config = require('./config')
var turf = require('turf')
var all_stops = require('../gtfs/geojson/stops.json');
var routeNamesToRouteNumbers = require('./routename_to_routenumber');

global["routeNamesToRouteNumbers"] = routeNamesToRouteNumbers;


var muni_url = 'http://bustracker.muni.org/InfoPoint/departures.aspx?stopid='
// var twilio = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

/* This scrapes and  parses the stop data from the muni */
// TODO: would be nice to show the bus number as well as the route name
function getStopFromBusTrackerId(busTrackerId, callback) {
    console.log('Getting stop data: ' + muni_url + busTrackerId);

    request(muni_url + busTrackerId, function (error, response, body) {
        if (error || response.statusCode != 200) {
            return callback(error || response.statusCode)
        }
        else {
            var parsed = {
                stops: []
            };
            parsed.route = body.match(/<h1>(.*)<\/h1>/)[1]

            var regex = /<div class='(routeName|departure)'>([^<]+)<\/div>/g
            var stopsAndTimes = []
            while (matches = regex.exec(body)) {
                stopsAndTimes.push(matches[2])
            }

            var currentStop = null
            stopsAndTimes.forEach(function(stopOrTime) {
                if (stopOrTime === 'Done') {
                    currentStop.times.push(stopOrTime)
                }
                else if(stopOrTime.search(/[AP]M$/) === -1) {
                    var routeName = prependRouteNumberToRouteName(stopOrTime); 
                    currentStop = {
                        name: routeName,
                        times: []
                    }
                    parsed.stops.push(currentStop)
                }
                else {
                    currentStop.times.push(stopOrTime.slice(0,-3))
                }
            })

            callback(null, formatStopData(parsed))
        }
    })
}

function getStopFromStopNumber(stopId, callback) {
    var busTrackerId = stop_number_lookup[stopId];
    console.log('Stop id = ' + stopId + ' => bus tracker id = ' + busTrackerId);
    getStopFromBusTrackerId(busTrackerId, callback);
}

function prependRouteNumberToRouteName(routeName) {
    if (!routeName || routeName=='') {
        return routeName;
    }

    var nameOnly = routeName.substr(0, routeName.lastIndexOf(" -"));
    var routeNumber = routeNamesToRouteNumbers[nameOnly];
    if (routeNumber) {
        return routeNumber + ' - ' + routeName;
    }
    return routeName;
}

/* This determines the formatting of the text message */
function formatStopData(jsonData) {
    // console.dir(jsonData)
    var out = '* ' + jsonData.route + ' *\n\n'

    jsonData.stops.forEach(function(stop) {
        out += stop.name + '\n'
        out += stop.times.join(', ') + '\n\n'
    })

    return out.trim()
}


var city_state = ', Anchorage, Alaska'; //set default city to Anchorage Alaska seems to work for Eagle River as well.

// Used by node-geocoder - might need API for higher volume requests
var geocoderProvider = 'google';
var httpAdapter = 'http';
var extra = {formatter: 'json'};
geocoder = require('node-geocoder').getGeocoder(geocoderProvider, httpAdapter, extra);

function getStopFromAddress(address, callback) {
    // geocode address
    geocoder.geocode(address+city_state, function(err, res) {
        lat = res[0].latitude;
        lon = res[0].longitude;
        console.log('geocoded "' + address + city_state + '" to: ' + lat + ', ' + lon);
        // TODO: handle lat/lng not found

        // find nearest stop
        var point = turf.point([lon, lat]);
        var nearest = turf.nearest(point, all_stops);
        // TODO: handle stop not found
        // TODO: handle multiple stops nearby

        getStopFromStopNumber(nearest.properties.stop_id, callback);
    })
}


module.exports.getStopFromBusTrackerId = getStopFromBusTrackerId;
module.exports.getStopFromStopNumber = getStopFromStopNumber;
module.exports.getStopFromAddress = getStopFromAddress;
