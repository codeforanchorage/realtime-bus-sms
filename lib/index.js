//var request = require('request')
//var config = require('./config')
var config = require('../config')
var routeNamesToRouteNumbers = require('./routename_to_routenumber');
var stop_number_lookup = require('./stop_number_lookup')
var turf = require('turf')
var all_stops = require('../gtfs/geojson/stops.json');
var exceptions = require('../gtfs/geojson/exceptions.json');
var moment = require('moment-timezone');
var low = require('lowdb')
var comments = low('./comments.json')
var http = require('http');
var nodemailer = require('nodemailer');
var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: config.GMAIL_USERNAME,
        pass: config.GMAIL_PASSWORD
    }
}, {
    from: config.FEEDBACK_EMAIL_FROM
});
var crypto = require('crypto');


function getStopFromStopNumber(stopId) {
    console.log(config.FEEDBACK_EMAIL_TO)
    var busTrackerId = stop_number_lookup[stopId];
    if (!busTrackerId) {
        return Promise.reject({name: `Stop number: ${stopId} isn't vaild.`, message:'Please enter the 4-digit stop number on the Bus Stop sign. You can skip leading zeroes.'});
    }
    return requestBusData(busTrackerId)
    .then((body)=>{
        return parseBusData(body, stopId);
    })
    .catch((err) => { console.log("Error requesting bus data: ", err);
                      return Promise.reject({message: 'Sorry, Bustracker is down'})
    })
}

 function getStopsFromAddress(address){
    var CITY_STATE = 'Anchorage, AK, USA'
    addressWithCity = address + ', ' + CITY_STATE;

    return getGeocodedAddress(addressWithCity)
    .then((geocodedAddress) => {
        if (!geocodedAddress || !geocodedAddress.streetName) { // This lies to the user if there is a geocoder error like a bad apiKey. 
            return Promise.reject({name: "Address not found", message:`Searched for ${addressWithCity}`})
        }
        lat = geocodedAddress.latitude;
        lon = geocodedAddress.longitude;
        var stops = findNearestStops(lat, lon);
        if (stops.length < 1) {
            return Promise.reject({name: "No Stops", message: `No stops found within ${config.NEAREST_BUFFER} mile` + ((config.NEAREST_BUFFER != 1) ? 's' : '')});
        }      
        stops.geocodedAddress = (geocodedAddress.streetNumber ? (geocodedAddress.streetNumber + " ") : "" ) + geocodedAddress.streetName;
        return stops;
    })
}

/* Scrape from the muni */
function requestBusData(busTrackerId) {
    return new Promise((resolve, reject) => {
        var request = http.get(config.MUNI_URL + busTrackerId, (response) => {
            if (response.statusCode < 200 || response.statusCode > 299) {
                reject(new Error('Failed to load bustracker, status code: ' + response.statusCode));
           }
          const body = [];
          response.on('data', (chunk) => body.push(chunk));
          response.on('end', () => resolve(body.join('')));
        });
        // handle connection errors of the request
        request.on('error', (err) => reject(err))
    })
};

/* Parse scraped muni data */
function parseBusData(body, stopId) {
    var parsed = { 
        stops: []
    };
    parsed.route = body.match(/<h1>(.*)<\/h1>/)[1];
    parsed.route = parsed.route.replace(/: (\d*)/, '') // the route number is appended to some but not all routes.
    parsed.stopId = stopId;
    
    var regex = /<div class='(routeName|departure)'>([^<]+)<\/div>/g
    var stopsAndTimes = []
    while (matches = regex.exec(body)) {
        stopsAndTimes.push(matches[2]);
    }
    var currentStop = null; 
    stopsAndTimes.forEach(function(stopOrTime) {
        if (stopOrTime === 'Done') {
            currentStop.times.push('Out of Service')
        }
        else if(stopOrTime.search(/\d\d:\d\d/) === -1) { // this is a not time so must be a routename. It should always be the first hit through the array
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
    });
    return parsed;
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

function stopLatLong(stopid) {
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
    var out = nearest_stops.features.map(function(stop){
        var stopId = stop.properties.stop_id.match(/\d+/g)[0];
        return { route: stop.properties.name,
                 stopId: stopId,
                 distance: turf.distance(point, stop, "miles"),
                 ll: stopLatLong(stopId)
             }
    });
    // returns empty if none found nearby
    out.sort(function(a, b) {
        return (a.distance - b.distance)
    });
    if (out.length > config.NEAREST_MAX) out = out.slice(0,config.NEAREST_MAX);
    return out;
}



// Used by node-geocoder - might need API for higher volume requests
var geocoderProvider = 'google';
var httpAdapter = 'https';
var extra = {
    formatter: 'json',
    apiKey: process.env.GOOGLE_MAPS_KEY,
};
geocoder = require('node-geocoder').getGeocoder(geocoderProvider, httpAdapter, extra);

function getGeocodedAddress(address) {
    // geocode address
    // TODO: what happens when we reach the free limit?
    return geocoder.geocode(address)
        .then((res) =>{
            var geocodedAddress = res[0];          
            return geocodedAddress;
        })
        .catch((e) => console.log("Error in geocoder: " + e));
    }

function processFeedback(feedback, req) {
    return new Promise(function(resolve, reject){
        feedback = feedback.trim();
        var response_hash = crypto.randomBytes(20).toString('hex');
        comments('comments').push({ date: (new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')),
                                    feedback: feedback,
                                    phone: req.body.From,
                                    email: req.body.email,
                                    ip: req.connection.remoteAddress,
                                    response_hash: response_hash});
        transporter.sendMail({
            to: config.FEEDBACK_EMAIL_TO,
            subject: 'Realtime Bus Feedback',
            text: `Feedback: ${feedback}
                   Phone: ${req.body.From}
                   Email: ${req.body.email} 
            ${req.body.From ? `Go to  ${req.protocol}://${req.get('host')}/respond?hash=response_hash to respond` : ""}`
        },function(error, response) {
            // response object has array of rejected, response code,and envelope if it's useful
            if (error) {
                console.log("Error sending feedback", error);
                reject("Error sending feedback: ", error);
                return;
            } else {
                resolve();
            }
        });
       
    });
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


module.exports.getStopsFromAddress = getStopsFromAddress;
module.exports.getStopFromStopNumber = getStopFromStopNumber;
module.exports.serviceExceptions = serviceExceptions;
module.exports.findNearestStops = findNearestStops;
module.exports.processFeedback = processFeedback;

/*
module.exports.getStopFromBusTrackerId = getStopFromBusTrackerId;
module.exports.getStopFromStopNumber = getStopFromStopNumber;
module.exports.getStopsFromAddress = getStopsFromAddress;
module.exports.formatStopData = formatStopData;
module.exports.findNearestStops = findNearestStops;
module.exports.processFeedback = processFeedback;
*/