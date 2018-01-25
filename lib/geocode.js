const config = require('./config'),
      gtfs = require('./gtfs'),
      request = require('request'),
      turf_distance = require('@turf/distance'),
      turf = require('@turf/helpers'),
      logger = require('./logger')

function stops_near_location(address){
    if (!address) {
        return Promise.reject(new NotFoundError("No Input"))
    }
    return getGeocodedAddress(address)
    .then((returnObj) => {
        const geocodedPlace = returnObj.data
        if (!geocodedPlace){
            return Promise.reject(new NotFoundError(`Searched for "${address}"`))
        }

        const {lat, lng} = geocodedPlace.location

        // Stops can be empty. If no stops are found within max distance
        // this returns an empty array for the data.stops so routes can decide what to do.
        const stops = findNearestStops(lat, lng);

        return {data: {stops: stops, geocodedAddress:geocodedPlace.formatted_address} , geocodeTime: returnObj.asyncTime};
    })
    .catch(err => {
        if (err.type == 'NOT_FOUND') return Promise.reject(err)
        // A real error from the goecoder must have occured to make it here.
        logger.error(err)
        return Promise.reject(err) // This lies to the user if there is a geocoder error.
    })
}

function getGeocodedAddress(address) {
    // TODO: what happens when we reach the free limit?
    const GEOCODE_URL_BASE = "https://maps.googleapis.com/maps/api/geocode/json?"
    const CITY = encodeURIComponent(config.GOOGLE_GEOCODE_LOCATION)
    const COUNTRY = "US"
    const timer = Date.now();
    return new Promise((resolve, reject) => {
        const query = encodeURIComponent(address)
        request(`${GEOCODE_URL_BASE}address=${query}&components=country:${COUNTRY}|administrative_area:${CITY}&key=${config.GOOGLE_MAPS_KEY}`, function(error, response, body){
            if (!error && response.statusCode == 200) {
                const geocodeData = JSON.parse(body)
                if (geocodeData.status != "OK") {
                    return reject(new GeocoderError(geocodeData.status))
                }
                const acceptable_types = [
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
                const result = geocodeData.results[0]
                const data = (result.types && acceptable_types.some(el => result.types.includes(el)))
                    ? {location:result.geometry.location, formatted_address: result.formatted_address}
                    : null

                resolve({data: data, asyncTime: Date.now()-timer})

            } else {
                reject(new GeocoderError(error))
            }
        })
    })
}

function findNearestStops(lat, lon) {
    const point = turf.point([+lon, +lat]);
    const out = gtfs.all_stops.features.reduce((acc, stop) => {
        const distance = turf_distance(point, stop, 'miles')

        if (distance <= config.NEAREST_BUFFER){
            const stopId = stop.properties.stop_id.match(/\d+/g)[0];
            acc.push({ route: stop.properties.name,
                       stopId: stopId,
                       distance: distance,
                       ll: stop.geometry.coordinates.join()
            });
        }
        return acc
    }, [])
    .sort((a, b) => (a.distance - b.distance))
    return out.length > config.NEAREST_MAX ? out.slice(0,config.NEAREST_MAX) : out
}

/*
    Custom Error Messages to help front end respond to different
     types of failed requests
*/
function NotFoundError(message) {
    this.name = "Address not found"
    this.message = message
    this.stack = Error().stack
    this.type = 'NOT_FOUND'
}
NotFoundError.prototype = new Error;

function GeocoderError(message) {
    this.name = "Geocoder Error"
    this.message = "An error occured while looking up this address."
    this.stack = Error().stack
    this.type = 'GEOCODER_ERROR'
}
GeocoderError.prototype = new Error;


module.exports.stops_near_location = stops_near_location;
module.exports.findNearestStops = findNearestStops;
/*
Anchorage, AK 99501
61.217627, -149.895680
*/