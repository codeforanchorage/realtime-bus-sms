/* TODO
logging
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


var muni_url = 'http://bustracker.muni.org/InfoPoint/departures.aspx?stopid='
// var twilio = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);


function parseInputReturnBusTimes(message, callback) {
    function resultsHandler(err, data) {
        // format the data if it's not just an error string
        var output = data
        if (typeof(data) === 'object') {
            output = formatStopData(data)
        }

        callback(err, output);
    }

    if (message.trim().toLowerCase() === 'about') {
        return resultsHandler(null, 'To get bus ETAs, text the bus stop #. If you do not know the bus stop #, text the closest street address or closest cross streets to the bus stop.');
    }
    else if (!message || /^\s*$/.test(message)) {
        resultsHandler(
            null,
            'No input.\nPlease send a stop number, intersection, ' +
            'or street address to get bus times.'
        );
    }
    else if (/^\d+$/.test(message)) {
        // the message is only digits -- assume it's a stop number
        getStopFromStopNumber(parseInt(message), resultsHandler);
    }
    else {
        // assume the user sent us an intersection or address
        getStopsFromAddress(message, resultsHandler)
    }
}


/* This scrapes and  parses the stop data from the muni */
function getStopFromBusTrackerId(busTrackerId, callback) {
    console.log('Getting stop data for busTrackerId = ' + busTrackerId);

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

            callback(null, parsed)
        }
    })
}

function getStopFromStopNumber(stopId, callback) {
    var busTrackerId = stop_number_lookup[stopId];
    console.log('Stop id = ' + stopId + ' => bus tracker id = ' + busTrackerId);
    if (!busTrackerId) {
        callback(null, 'Invalid stop number.\nPlease enter the 4-digit stop number on the Bus Stop sign.');
        return;
    }
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
    // var route = jsonData.route.replace(/: \d*/, ''); // take out stop #
    var route = jsonData.route.replace(/: (\d*)/, ' stop #$1');
    var out = '* ' + route + ' *\n\n'

    jsonData.stops.forEach(function(stop) {
        out += stop.name + '\n'
        out += stop.times[0] + '\n\n'
    })

    return out.trim()
}

// this returns just one stop ID
function findNearestStop(lat, lon) {
    var point = turf.point([lon, lat]);
    var nearest = turf.nearest(point, all_stops);
    return nearest.properties.stop_id;
}

// this returns an array of stop IDs
function findNearestStops(lat, lon) {
    var point = turf.point([lon, lat]);
    var buffer = turf.buffer(point, .25, 'miles');
    var nearest_stops = turf.within(all_stops, buffer);

    var out = nearest_stops.features.map(function(stop){
        return stop.properties.name + ' (stop: ' + stop.properties.stop_id + ')';
    }).join('\n');

    return 'Enter one of these stop numbers for details:\n\n' + out;
}


var CITY_STATE = 'Anchorage, AK, USA'

// Used by node-geocoder - might need API for higher volume requests
var geocoderProvider = 'google';
var httpAdapter = 'http';
var extra = {formatter: 'json'};
geocoder = require('node-geocoder').getGeocoder(geocoderProvider, httpAdapter, extra);

function getStopFromAddress(address, callback) {
    // geocode address
    // TODO: what happens when we reach the free limit?
    address = address + ', ' + CITY_STATE;
    geocoder.geocode(address, function(err, res) {
        if (err) { return callback(err); }

        var geocodedAddress = res[0];
        lat = geocodedAddress.latitude;
        lon = geocodedAddress.longitude;
        console.log('geocoded "' + address + '" to: ' + lat + ', ' + lon);

        if (!geocodedAddress.streetName) {
            // this means we didn't find an address, and the geocoder
            // just returned Anchorage, AK USA
            console.error('Address not found:', address);
            callback(null, 'Address or bus stop number not found.');
            return;
        }

        // find nearest stop
        var stop = findNearestStop(lat, lon);
        // TODO: handle stop not found (or very very far away)
        // TODO: handle multiple stops nearby

        getStopFromStopNumber(stop, callback);
    })
}

function getStopsFromAddress(address, callback) {
    // geocode address
    // TODO: what happens when we reach the free limit?
    address = address + ', ' + CITY_STATE;
    geocoder.geocode(address, function(err, res) {
        if (err) { return callback(err); }

        var geocodedAddress = res[0];
        lat = geocodedAddress.latitude;
        lon = geocodedAddress.longitude;
        console.log('geocoded "' + address + '" to: ' + lat + ', ' + lon);

        if (!geocodedAddress.streetName) {
            // this means we didn't find an address, and the geocoder
            // just returned Anchorage, AK USA
            console.error('Address not found:', address);
            callback(null, 'Address or bus stop number not found.');
            return;
        }

        // find nearest stop
        var stops = findNearestStops(lat, lon);
        callback(null, stops);
    });
}


module.exports.getStopFromBusTrackerId = getStopFromBusTrackerId;
module.exports.getStopFromStopNumber = getStopFromStopNumber;
module.exports.getStopFromAddress = getStopFromAddress;
module.exports.getStopsFromAddress = getStopsFromAddress;
module.exports.formatStopData = formatStopData;
module.exports.findNearestStop = findNearestStop;
module.exports.parseInputReturnBusTimes = parseInputReturnBusTimes;
