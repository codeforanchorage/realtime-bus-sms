/* TODO
 logging
 use express middleware
 */

var request = require('request')
var http = require('http')
var querystring = require('querystring')
var stop_number_lookup = require('./stop_number_lookup')
var config = require('./config')
var turf = require('turf')
var all_stops = require('../gtfs/geojson/stops.json');
var low = require('lowdb')
var comments = low('./comments.json')
var routeNamesToRouteNumbers = require('./routename_to_routenumber');
var nodemailer = require('nodemailer');
var moment = require('moment-timezone');
var exceptions = require('../gtfs/geojson/exceptions.json');
var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: config.GMAIL_USERNAME,
        pass: config.GMAIL_PASSWORD
    }
}, {
    from: config.FEEDBACK_EMAIL_FROM
});





var muni_url = 'http://bustracker.muni.org/InfoPoint/departures.aspx?stopid='
// var twilio = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);


function parseInputReturnBusTimes(message, callback, returnHtml) {
    function resultsHandler(err, data) {
        // format the data if it's not just an error string
        var output = data
        if (typeof(data) === 'object') {
            output = formatStopData(data, returnHtml)
        }

        callback(err, output);
    }

    if (message.trim().toLowerCase() === 'about') {
        return resultsHandler(null, 'Get bus ETAs, text the busstop #. Don\'t know the busstop #, text closest street address or cross streets and get up to 5 closest stops within a mile, text back desired 4 digit bustop number. Text \'Feedback: ..\' to send feedback. Made by Code for Anchorage');
    }
    if (!message || /^\s*$/.test(message)) {
        return resultsHandler(
            null,
            'No input.\nPlease send a stop number, intersection, ' +
            'or street address to get bus times.'
        );
    }
    if (serviceExceptions()) {
        return resultsHandler(null, "No Service - Holiday");
    }
    if (/^\d+$|^\#\d+$/.test(message)) {
        // the message is only digits or # + digits-- assume it's a stop number
        getStopFromStopNumber(parseInt(message.replace('#','')), resultsHandler);
    } else {
        // assume the user sent us an intersection or address
        getStopsFromAddress(message, resultsHandler)
    }
}


/* This scrapes and  parses the stop data from the muni */
function getStopFromBusTrackerId(busTrackerId, stopId, callback) {
    console.log('Getting stop data for busTrackerId = ' + busTrackerId);

    request(muni_url + busTrackerId, function (error, response, body) {
        if (error) return callback(error);
        if (response.statusCode != 200) {
            return callback(null, 'Sorry, Bustracker is down');
        }
        else {
            var parsed = {
                stops: []
            };
            console.log(body);
            parsed.route = body.match(/<h1>(.*)<\/h1>/)[1]
            parsed.stopId = stopId;

            var regex = /<div class='(routeName|departure)'>([^<]+)<\/div>/g
            var stopsAndTimes = []
            while (matches = regex.exec(body)) {
                stopsAndTimes.push(matches[2])
            }

            var currentStop = null
            stopsAndTimes.forEach(function(stopOrTime) {
                if (stopOrTime === 'Done') {
                    currentStop.times.push('Out of Service')
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
                    // Remove leading zero if one. Leave if there are two (if time comes back as 00:30 AM for example)
                    currentStop.times.push(stopOrTime.replace(/^0{1}/, ''));
                }
            })

            callback(null, [parsed])
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
    getStopFromBusTrackerId(busTrackerId, stopId, callback);
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
function formatStopData(jsonData, returnHtml) {
    // var route = jsonData.route.replace(/: \d*/, ''); // take out stop #
    var out = "";
    console.log(jsonData);
    if (jsonData.length > 1) out = 'Enter one of these stop numbers for details:\n\n';
    for (var i=0; i < jsonData.length; i++) {
        var route = jsonData[i].route.replace(/: (\d*)/, '') + " stop #" + jsonData[i].stopId;
        if (returnHtml) {
            var ll = stopLatLong(jsonData[i].stopId);
            if (ll) {
                route = '<a href="https://maps.google.com/?q=' + ll + '">' + route + '</a>';
            }
        }
        out += '* ' + route + ' ' + (jsonData[i].distance ? '('+jsonData[i].distance.toFixed(1)+' miles) ' : '') + '*\n\n';

        if (jsonData[i].stops) {
            jsonData[i].stops.forEach(function(stop) {
                out += stop.name + '\n'
                out += stop.times[0] + '\n\n'
            })
        }
    }

    return out.trim()
}

// Given a stop ID, return a <lat, long> string
function stopLatLong(stopid) {
    console.log("Stopid: " + stopid);
    for (var i=0; i < all_stops.features.length; i++) {
        if (all_stops.features[i].properties.stop_id.match(/\d+/g)[0] == stopid) {
            return all_stops.features[i].geometry.coordinates[1] + "," + all_stops.features[i].geometry.coordinates[0];
        }
    }
    return "";
}

// this returns an array of stop IDs
function findNearestStops(lat, lon) {
    var point = turf.point([lon, lat]);
    var buffer = turf.buffer(point, config.NEAREST_BUFFER, 'miles');
    var nearest_stops = turf.within(all_stops, buffer);
    console.log(nearest_stops);
    var out = nearest_stops.features.map(function(stop){
        var stopId = stop.properties.stop_id.match(/\d+/g)[0];
        return { route: stop.properties.name + ': ' + stopId,
            stopId: stopId,
            distance: turf.distance(point, stop, "miles")}
    });

    if (out.length < 1) {
        out = 'No stops found within '+ config.NEAREST_BUFFER + ' mile' + ((config.NEAREST_BUFFER != 1) ? 's' : '');
    } else {
        out.sort(function(a, b) {
            return (a.distance - b.distance)
        });
        if (out.length > config.NEAREST_MAX) out = out.slice(0,config.NEAREST_MAX);
    }

    return out;
}


var CITY_STATE = 'Anchorage, AK, USA'

// Used by node-geocoder - might need API for higher volume requests
var geocoderProvider = 'google';
var httpAdapter = 'http';
var extra = {formatter: 'json'};
geocoder = require('node-geocoder').getGeocoder(geocoderProvider, httpAdapter, extra);

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

function processFeedback(feedback, callback, returnHtml) {
    feedback = feedback.trim();
    comments('comments').push('['+(new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''))+']'+(feedback));
    transporter.sendMail({
        to: config.FEEDBACK_EMAIL_TO,
        subject: 'Realtime Bus Feedback',
        text: feedback
    },function(error, response) {
        if (error) {
            console.log(error);
        } else {
            console.log('Feedback message sent');
        }
    });
    if (feedback) {
        console.log('This is a comment:');
        console.log(feedback);
    } else {
        console.log("Empty feedback sent");
    }
    var resp = 'Thanks for the feedback';
    resp += returnHtml ? ' <br> <a href="/">back</a>' : '';
    callback(null, resp);

}

function serviceExceptions() {
    // Check for holiday exceptions
    var dateTz = moment.tz(new Date(), config.TIMEZONE).format("YYYYMMDD");
    var noService = false;
    var replacementService = false;
    for(var i=0; (i < exceptions.exceptions.length) && !replacementService; i++) {
        if (exceptions.exceptions[i].date == dateTz) {
            if (exceptions.exceptions[i].exception_type == 1) {
                replacementService = true;
                noService = false;
            } else {
                noService = true;
            }
        }
    }
    return noService;
}


module.exports.getStopFromBusTrackerId = getStopFromBusTrackerId;
module.exports.getStopFromStopNumber = getStopFromStopNumber;
module.exports.getStopsFromAddress = getStopsFromAddress;
module.exports.formatStopData = formatStopData;
module.exports.parseInputReturnBusTimes = parseInputReturnBusTimes;
module.exports.findNearestStops = findNearestStops;
module.exports.processFeedback = processFeedback;
module.exports.serviceExceptions = serviceExceptions;
