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
        return Promise.reject({name: `I couldn't find stop number ${stopId}`, 
            message:"Stop numbers are on the bus stop sign (you can skip leading zeroes). If you can't find the stop number, send an address or intersection."});
    }
    return requestBusData(busTrackerId)
    .then((muniBusData)=>{
        return {data: parseBusData(muniBusData.data, stopId), muniTime:muniBusData.asyncTime};
    })
    .catch((err) => { logger.error(err);
                      return Promise.reject({message: 'Sorry, Bustracker is down'})
    })
}


/*
* @function getStopsFromAddress
* @param address - almost any text you think Google can figure out
* @returns an Promise which is: {data: {stops:[found-stops],geocodedAddress:theaddress}, geocodeTime: timing-of-Google-request  }
*
* asyncTime is how long the goecoder took
*/

 function getStopsFromAddress(address){
    var CITY_STATE = 'Anchorage, AK, USA'
    addressWithCity = address + ", " + CITY_STATE;
    return exports.getGeocodedAddress(address)
    .then((returnObj) => {
        var geocodedPlace = returnObj.data
        var geocodedCoords = geocodedPlace.geometry.location // should be undefined when address isn't found
        var address = geocodedPlace.formatted_address
      
        if (address == CITY_STATE) { // This will be returned if we only matched on the city/state but not an address
            return Promise.reject({name: "Address not found", message:`Searched for "${addressWithCity}"`, type:'NOT_FOUND'})
        }
        lat = geocodedCoords.lat;
        lon = geocodedCoords.lng;
        
        // Stops can be empty if no stops are found within 
        // This returns empty array for the data.stops so routes can decide what to do.
        var stops = findNearestStops(lat, lon);   

        return {data: {stops: stops, geocodedAddress:address} , geocodeTime: returnObj.asyncTime};
    })
    .catch(err => {
        if (err.type == 'NOT_FOUND') return Promise.reject(err)
        // A real error from the goecoder must have occured to make it here.
        logger.error(err)
        return Promise.reject({name: "Address not found", message:`Searched for "${addressWithCity}"`}) // This lies to the user if there is a geocoder error. 
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
        throw new Error('Unexpected result from Muni. Can not parse returned value.');
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

/* config for node-geocoder - might need API for higher volume requests */
var geocoderProvider = 'google';
var httpAdapter = 'https';
var extra = {
    formatter: 'json',
    apiKey: process.env.GOOGLE_MAPS_KEY,
}
geocoder = require('node-geocoder').getGeocoder(geocoderProvider, httpAdapter, extra);

function getGeocodedAddress(address) {
    // TODO: what happens when we reach the free limit?
    var timer = Date.now();
    return new Promise((resolve, reject) => {
        var geocodeURLBase = "https://maps.googleapis.com/maps/api/geocode/json?"
        var CITY = "Anchorage"
        var COUNTRY = "US" // ISO 3166-1 codes for country
        var querry = encodeURIComponent(address)
        request(`${geocodeURLBase}address=${querry}&components=country:${COUNTRY}|administrative_area:${CITY}`, function(error, response, body){
            if (!error && response.statusCode == 200) {
                var result = JSON.parse(body)
                console.log(result)
                resolve({data: result.results[0], asyncTime: Date.now()-timer})

            } else {
                reject("Geocoding Error: ", error)
            }

        })

    })
    /*
    return geocoder.geocode({address: address, country: "US", administrative_area: "Alaska"})
        .then((res) =>{
            var geocodedAddress = res[0];
            console.log("Geocoded: ", geocodedAddress)
            return {data: geocodedAddress, asyncTime: Date.now()-timer};
        })
    */
}

function processFeedback(feedback, req) {
    return new Promise(function(resolve, reject){
        feedback = feedback.trim();
        var response_hash = crypto.randomBytes(20).toString('hex');
        comments.defaults({ comments: []}).value()
        comments.get('comments').push({ date: (new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')),
                                    feedback: feedback,
                                    phone: req.body.From,
                                    email: req.body.email,
                                    ip: req.connection.remoteAddress,
                                    response_hash: response_hash}).value();
        /*
        transporter.sendMail({
            to: config.FEEDBACK_EMAIL_TO,
            subject: 'Realtime Bus Feedback',
            text: `Feedback: ${feedback}
                   Phone: ${req.body.From}
                   Email: ${req.body.email}
            ${req.body.From ? `Go to  ${req.protocol}://${req.get('host')}/respond?hash=${response_hash} to respond` : ""}`
        },function(error, response) {
            // response object has array of rejected, response code,and envelope if it's useful
            if (error) {
                logger.warn("Error sending feedback", error);
                reject("Error sending feedback: ", error);
                return;
            } else {
                resolve();
            }
        });
        */

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
module.exports.getStopsFromAddress = getStopsFromAddress;
module.exports.getStopFromStopNumber = getStopFromStopNumber;
module.exports.serviceExceptions = serviceExceptions;
module.exports.findNearestStops = findNearestStops;
module.exports.processFeedback = processFeedback;

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
