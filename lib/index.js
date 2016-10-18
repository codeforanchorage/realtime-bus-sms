var request = require('request')
var config = require('./config')
var routeNamesToRouteNumbers = require('./routename_to_routenumber');
var stop_number_lookup = require('./stop_number_lookup')
var turf = require('turf')
var all_stops = require('../gtfs/geojson/stops.json');
var exceptions = require('../gtfs/geojson/exceptions.json');
var moment = require('moment-timezone');
var low = require('lowdb')
var comments = low('./comments.json')


/* This scrapes and  parses the stop data from the muni */
function getStopFromBusTrackerId(busTrackerId, stopId) {
    console.log('Getting stop data for busTrackerId = ' + busTrackerId);
    var startMuniTime = Date.now();
    return new Promise(function(resolve, reject){
        request(config.MUNI_URL + busTrackerId, function (error, response, body) {
            if (error || response.statusCode != 200) {
                if (error) console.log(error);
                reject({message: 'Sorry, Bustracker is down'});
            }
            else {
                var muniTime = Date.now() - startMuniTime;
                var parsed = {
                    stops: []
                };
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
                    else if(stopOrTime.search(/\d\d:\d\d/) === -1) { // this is a time
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
                console.log("parsed: ", parsed)
                resolve(parsed, muniTime)
         }
        })
    })
}

function getStopFromStopNumber(stopId) {
     return new Promise(function(resolve, reject){
        var busTrackerId = stop_number_lookup[stopId];
        console.log('Stop id = ' + stopId + ' => bus tracker id = ' + busTrackerId);
        if (!busTrackerId) {
            // or maybe return null
            reject({name: `Stop number: ${stopId} isn't vaild.`, message:'Please enter the 4-digit stop number on the Bus Stop sign. You can skip leading zeroes.'});
        }
        else {
            resolve(getStopFromBusTrackerId(busTrackerId, stopId));
        }
    });
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
   // console.log(nearest_stops);
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
    console.log("nearest stops: ", out);
    return out;
}

var CITY_STATE = 'Anchorage, AK, USA'

// Used by node-geocoder - might need API for higher volume requests
var geocoderProvider = 'google';
var httpAdapter = 'https';
var extra = {
    formatter: 'json',
    apiKey: process.env.GOOGLE_MAPS_KEY,
};
geocoder = require('node-geocoder').getGeocoder(geocoderProvider, httpAdapter, extra);

function getStopsFromAddress(address) {
    // geocode address
    // TODO: what happens when we reach the free limit?
    return new Promise(function(resolve, reject){
        address = address + ', ' + CITY_STATE;

        geocoder.geocode(address)
            .then((res) =>{
                var geocodedAddress = res[0];
                lat = geocodedAddress.latitude;
                lon = geocodedAddress.longitude;
                    //console.log('geocoded "' + address + '" to: ' + lat + ', ' + lon);
                    //console.log('geocoded "' + address + '" to: ' + JSON.stringify(geocodedAddress));
                if (!geocodedAddress.streetName) {
                        //  geocoder just returned Anchorage, AK USA
                    reject({name: "Address not found", message:`Searched for ${address}`});
                    return;
                 }
                var stops = findNearestStops(lat, lon);
                stops.geocodedAddress = (geocodedAddress.streetNumber ? (geocodedAddress.streetNumber + " ") : "" ) + geocodedAddress.streetName;
               // stops = formatStopData(stops)
                resolve(stops);

           })
           .catch((e) => {reject("Error in geocoder: " + e)});
        });
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
            text: "Feedback: " + feedback + '\n' + "Phone: " + req.body.From + "\n" + "Email: " + req.body.email +
            ((req.body.From) ? '\n Go to ' + req.protocol + '://' + req.get('host') + '/respond?hash=' + response_hash +' to respond' : "")
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
        resolve();
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

/*
module.exports.getStopFromBusTrackerId = getStopFromBusTrackerId;
module.exports.getStopFromStopNumber = getStopFromStopNumber;
module.exports.getStopsFromAddress = getStopsFromAddress;
module.exports.formatStopData = formatStopData;
module.exports.findNearestStops = findNearestStops;
module.exports.processFeedback = processFeedback;
*/