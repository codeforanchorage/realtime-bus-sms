var config = require('./config')
var all_stops = require('../gtfs/geojson/stops.json');
var request = require('request')

var turf_within = require('@turf/within')
var turf_circle = require('@turf/circle')
var turf_distance = require('@turf/distance')
var turf_helpers = require('@turf/helpers')
var logger = require('./logger')

function getStopsFromAddress(address){
    return getGeocodedAddress(address)
    .then((returnObj) => {
        var geocodedPlace = returnObj.data
        if (!geocodedPlace){
            return Promise.reject(new NotFoundError(`Searched for "${address}"`))
        }

        var address = geocodedPlace.formatted_address
        var {lat, lng} = geocodedPlace.location

        // Stops can be empty. If no stops are found within max distance
        // this returns an empty array for the data.stops so routes can decide what to do.
        var stops = findNearestStops(lat, lng);

        return {data: {stops: stops, geocodedAddress:address} , geocodeTime: returnObj.asyncTime};
    })
    .catch(err => {
        if (err.type == 'NOT_FOUND') return Promise.reject(err)
        // A real error from the goecoder must have occured to make it here.
        logger.error(err)
        return Promise.reject(new NotFoundError(`Searched for "${address}"`)) // This lies to the user if there is a geocoder error.
    })
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

function findNearestStops(lat, lon) {
    var point = turf_helpers.point([+lon, +lat]);
    var buffer = turf_helpers.featureCollection([turf_circle(point, config.NEAREST_BUFFER, 64, 'miles')]);
    var nearest_stops = turf_within(all_stops, buffer);

    var out = nearest_stops.features.map(stop => {
        var stopId = stop.properties.stop_id.match(/\d+/g)[0];
        return { route: stop.properties.name,
                 stopId: stopId,
                 distance: turf_distance(point, stop, "miles"),
                 ll: stopLatLong(stopId)
        }
    });
    // returns empty if none found nearby
    out.sort((a, b) => (a.distance - b.distance))

    if (out.length > config.NEAREST_MAX) out = out.slice(0,config.NEAREST_MAX);
    return out;
}

function stopLatLong(stopid) {
    var stop = all_stops.features.find(stop => stop.properties.stop_id == stopid)
    return stop && stop.geometry.coordinates.join()
}

function NotFoundError(message) {
    this.name = "Address not found"
    this.message = message
    this.stack = Error().stack
    this.type = 'NOT_FOUND'
}
NotFoundError.prototype = new Error;

module.exports.stops_near_location = getStopsFromAddress;
module.exports.findNearestStops = findNearestStops;
/*
Anchorage, AK 99501
61.217627, -149.895680
*/