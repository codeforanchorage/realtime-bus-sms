/* TODO
logging
authenticate that requests are from twilio
use express middleware
*/

var request = require('request')
var http = require('http')
var querystring = require('querystring')
var stop_number_lookup = require('./stop_number_lookup')
var config = require('./config')

var muni_url = 'http://bustracker.muni.org/InfoPoint/departures.aspx?stopid='
// var twilio = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

// Used by node-geocoder - might need API for higher volume requests
var geocoderProvider = 'google';
var httpAdapter = 'http';
var extra = {formatter: 'json'};
geocoder = require('node-geocoder').getGeocoder(geocoderProvider, httpAdapter, extra);

/* This scrapes and  parses the stop data from the muni */
function getStopData(bustrackerId, callback) {
    request(muni_url + bustrackerId, function (error, response, body) {
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
                    currentStop = {
                        name: stopOrTime,
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

function getStopFromAddress(address, callback) {
    geocoder.geocode(address+city_state, function(err, res) {
        lat = res[0].latitude;
        lon = res[0].longitude;
        console.log(lat + ' ' + lon);
        carto_url_beg = 'http://brendanbabb.cartodb.com/api/v2/sql?q=SELECT%20bustracker_id%20FROM%20gtfs_bustracker_lat_long%20ORDER%20BY%20the_geom%20%3C-%3E%20CDB_LatLng(';
        carto_url_end = ')%20LIMIT%201&api_key=' + config.CARTODB_API_KEY;
        carto_url = carto_url_beg + lat + ',' + lon + carto_url_end;
        console.log(carto_url);
        request(carto_url, function (error, response, body) {
            if (error || response.statusCode != 200) {
                return callback(error || response.statusCode)
            }
            else {
                //console.log(JSON.parse(body).rows[0].bustracker_id);
                bus_id = JSON.parse(body).rows[0].bustracker_id;
                console.log(bus_id);
                getStopData(bus_id, callback)
            }
        })
    })
}


module.exports.getStopData = getStopData;
module.exports.getStopFromAddress = getStopFromAddress;
