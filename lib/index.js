var request = require('request')
var config = require('./config')
var routeNamesToRouteNumbers = require('./routename_to_routenumber');
var stop_number_lookup = require('./stop_number_lookup')
var turf = require('turf')
var all_stops = require('../gtfs/geojson/stops.json');
var exceptions = require('../gtfs/geojson/exceptions.json');
var moment = require('moment-timezone');
var low = require('lowdb')
var comments = low('./comments.json', { storage: require('lowdb/lib/file-async') });
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
var logger = require('./logger')


/*
* @function getStopFromStopNumber
* @param stopID
* @returns an object which is: {data:from-parseBusData, muniTime: timing-of-muni-request  }
*
*/
function getStopFromStopNumber(stopId) {
    var busTrackerId = stop_number_lookup[stopId];
    if (!busTrackerId) {
        var err = new Error("Stop numbers are on the bus stop sign (you can skip leading zeroes). If you can't find the stop number, send an address or intersection.")
        err.name = `I couldn't find stop number ${stopId}`
        return Promise.reject(err)
    }
    return requestBusData(busTrackerId)
    .then((muniBusData)=>{
        return {data: parseBusData(muniBusData.data, stopId), muniTime:muniBusData.asyncTime};
    })
    .catch((err) => Promise.reject(new Error('Sorry, Bustracker is down')))
}

/*
* @function getStopsFromAddress
* @param address - almost any text you think Google can figure out
* @returns an Promise which is: {data: {stops:[found-stops],geocodedAddress:theaddress}, geocodeTime: timing-of-Google-request  }
*
* asyncTime is how long the goecoder took
*/
function NotFoundError(message) {
    this.name = "Address not found"
    this.message = message
    this.stack = Error().stack
    this.type = 'NOT_FOUND'
}
NotFoundError.prototype = new Error;

function getStopsFromAddress(address){

    return exports.getGeocodedAddress(address)
    .then((returnObj) => {
        var geocodedPlace = returnObj.data
        if (!geocodedPlace){
            return Promise.reject(new NotFoundError(`Searched for "${address}"`))
        }
        var address = geocodedPlace.formatted_address
        var lat = geocodedPlace.location.lat;
        var lon = geocodedPlace.location.lng;
        
        // Stops can be empty. If no stops are found within max distance
        // this returns an empty array for the data.stops so routes can decide what to do.
        var stops = findNearestStops(lat, lon);   
      
        return {data: {stops: stops, geocodedAddress:address} , geocodeTime: returnObj.asyncTime};
    })
    .catch(err => {
        if (err.type == 'NOT_FOUND') return Promise.reject(err)
        // A real error from the goecoder must have occured to make it here.
        logger.error(err)
        return Promise.reject(new NotFoundError(`Searched for "${address}"`)) // This lies to the user if there is a geocoder error. 
    })
}

/**
* @function requestBusData
* @param busTrackerId - not the same as the stop number
* @returns {Promise} - resolves to {data:raw-html-text, asyncTime:timedRepsonsforHttpCall}. Rejects with error if we can't connect or recieve non 2xx response.
*
*/
function requestBusData(busTrackerId) {
    return new Promise((resolve, reject) => {
        var asyncTime =  Date.now()
        var request = http.get(config.MUNI_URL + busTrackerId, (response) => {
            if (response.statusCode < 200 || response.statusCode > 299) {
                reject(new Error('Failed to load bustracker, status code: ' + response.statusCode));
            }
            const body = [];
            response.on('data', (chunk) => body.push(chunk));
            response.on('end', () => {
                resolve({
                    data: body.join(''),
                    asyncTime: Date.now() - asyncTime
                });
            });
        });
        request.on('error', (err) => reject(err))
    })
};

/**
*
* @function parseBusData
* @param {string} body - The raw html from the muni
* @param {stopId} - integer: the busstop ID entered by the user.
* @returns {Object} - {stops: [{name:route-number - name, times: [array of times]}], stop: stop-name, stopId:stop-number }
*
*/
function parseBusData(body, stopId) {
    var parsed = {
        stops: []
    };

    var stop = body.match(/<h1>(.*)<\/h1>/)
    if (stop == null) {
        var err = new Error('Unexpected result from Muni. Cannot parse returned value.');
        logger.error(err, {htmlBody: body, stopID: stopId});
        throw err;
    }
    parsed.stop = stop[1];

    parsed.stop = parsed.stop.replace(/: (\d*)/, '') // the route number is appended to some but not all routes.
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
            var routeObject = prependRouteNumberToRouteName(stopOrTime);
            currentStop = {
                name: routeObject.routeName,
                number:routeObject.routeNumber,
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
        return {routeNumber: routeNumber, routeName: routeName};
    }
    return {routeName: routeName};
}

function stopLatLong(stopid) {
    for (var i=0; i < all_stops.features.length; i++) {
        if (all_stops.features[i].properties.stop_id.match(/\d+/g)[0] == stopid) {
            return all_stops.features[i].geometry.coordinates[1] + "," + all_stops.features[i].geometry.coordinates[0];
        }
    }
    return "";
}

/**
* @function findNearestStops
* @returns object {route: stopId: distance: ll:}
*
*/
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

function getGeocodedAddress(address) {
    // TODO: what happens when we reach the free limit?
    var GEOCODE_URL_BASE = "https://maps.googleapis.com/maps/api/geocode/json?"
    var CITY = config.GOOGLE_GEOCODE_LOCATION
    var COUNTRY = "US" 
    var timer = Date.now();
    return new Promise((resolve, reject) => {
        var querry = encodeURIComponent(address)
        request(`${GEOCODE_URL_BASE}address=${querry}&components=country:${COUNTRY}|administrative_area:${CITY}&key=${process.env.GOOGLE_MAPS_KEY}`, function(error, response, body){
            if (!error && response.statusCode == 200) {
                var geocodeData = JSON.parse(body)
                if (geocodeData.status != "OK") { 
                    return reject(new Error(`Geocoder Error: ${geocodeData.status}`))
                }
                var acceptable_types = [
                    'route', 
                    'street_address',
                    'intersection',
                    'transit_station',
                    'point_of_interest',
                    'establishment',
                    'train_station', 
                    'bus_station',
                    'neighborhood'
                ]
                var result = geocodeData.results[0]

                var data = (result.types && acceptable_types.some(el => result.types.includes(el)))
                    ? {location:result.geometry.location, formatted_address: result.formatted_address}
                    : null
                resolve({data: data, asyncTime: Date.now()-timer})

            } else {
                reject(error)
            }
        })

    })
}

function processFeedback(feedback, req) {

    var payload = {text: `Feedback: ${feedback}
                 Phone: ${req.body.From}
                 Email: ${req.body.email}
          ${req.body.From ? `Go to  ${req.protocol}://${req.get('host')}/respond?hash=${response_hash} to respond` : ""}`};

    request.post(config.SLACK_WEBHOOK).form(JSON.stringify(payload));

    return new Promise(function(resolve, reject){
        feedback = feedback.trim();
        var response_hash = crypto.randomBytes(20).toString('hex');
        comments.defaults({ comments: []}).value();
        comments.get('comments').push({ date: (new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')),
                                    feedback: feedback,
                                    phone: req.body.isFB ? undefined : req.body.From,
                                    fbUser: req.body.isFB ? req.body.From : undefined,
                                    email: req.body.email,
                                    ip: req.connection.remoteAddress,
                                    response_hash: response_hash}).value();
        resolve()
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

/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyFBRequestSignature(req, res, buf) {
    var signature = req.headers["x-hub-signature"];

    if (!signature) {
        // For testing, let's log an error. In production, you should throw an
        // error.
        console.log("Don't have a signature");
        throw new Error("Couldn't validate the signature.");
    } else {
        var elements = signature.split('=');
        var method = elements[0];
        var signatureHash = elements[1];

        var expectedHash = crypto.createHmac('sha1', config.FB_APP_SECRET)
            .update(buf)
            .digest('hex');
        console.log("Signature: ",signatureHash, " Expected: ", expectedHash);
        if (signatureHash != expectedHash) {
            throw new Error("Couldn't validate the request signature.");
        }
    }
}

module.exports.getStopsFromAddress = getStopsFromAddress;
module.exports.getStopFromStopNumber = getStopFromStopNumber;
module.exports.serviceExceptions = serviceExceptions;
module.exports.findNearestStops = findNearestStops;
module.exports.processFeedback = processFeedback;
module.exports.verifyFBRequestSignature = verifyFBRequestSignature;

// export this for unit testing purposes
module.exports.getGeocodedAddress = getGeocodedAddress

/*
module.exports.getStopFromBusTrackerId = getStopFromBusTrackerId;
module.exports.getStopFromStopNumber = getStopFromStopNumber;
module.exports.getStopsFromAddress = getStopsFromAddress;
module.exports.formatStopData = formatStopData;
module.exports.findNearestStops = findNearestStops;
module.exports.processFeedback = processFeedback;
*/
