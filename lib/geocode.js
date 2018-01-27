'use strict';

const config = require('./config'),
      gtfs = require('./gtfs'),
      request = require('request'),
      turf_distance = require('@turf/distance'),
      turf = require('@turf/helpers'),
      logger = require('./logger')

/**
 * Finds stops with a distance (config.NEAREST_BUFFER) from a geographic place.
 * This currently uses the google places api which
 * returns results from ambiguous requests.
 * @module lib/geocode
 */

/**
 * @typedef StopData
 * @property {string} Route      - Name of the stop
 * @property {string} stopId     - Stop number
 * @property {number} distance   - distance in miles to stop from searched location
 * @property {string} ll         - latitude/longitude of stop
 */

/**
 * @typedef GeocodedStops
 * @property {object} data
 * @property {array<StopData>} data.stops  - list of stops within buffer distance
 * @property {string} geocodedAddress      - full address returned by google
 * @property {number} geocodeTime          - response time in ms of google request
 */

/**
 * Find stops near location.
 * Promise will reject with error if location is not found
 * @param {string} address - The place we are looking for
 * @returns {promise<GeocodedStops>}
 */
function stops_near_location(address){
    if (!address) {
        return Promise.reject(new NotFoundError("No Input"))
    }
    return getGeocodedAddress(address)
    .then(returnObj => {
        const geocodedPlace = returnObj.data
        if (!geocodedPlace) return Promise.reject(new NotFoundError(`Searched for "${address}"`))

        const {lat, lng} = geocodedPlace.location
        const stops = findNearestStops(lat, lng) // Stops will be an empty array if no stops are found
        return {
            data: {
                stops: stops,
                geocodedAddress:geocodedPlace.formatted_address
            },
            geocodeTime: returnObj.asyncTime
        }
    })
    .catch(err => {
        if (err.type !== 'NOT_FOUND') logger.error(err)
        return Promise.reject(err)
    })
}

/**
 * Geocodes a place near Anchorage
 * Promise rejects with NotFoundError if no place is found.
 * @param {string} address
 * @returns {promise<{location: string, formatted_addess: string}>}
 */
function getGeocodedAddress(address) {
    // TODO: what happens when we reach the free limit?
    const CITY = encodeURIComponent(config.GOOGLE_GEOCODE_LOCATION)
    const COUNTRY = "US"
    const timer = Date.now();
    return new Promise((resolve, reject) => {
        const query = encodeURIComponent(address)
        request(`${config.GEOCODE_URL_BASE}query=${query}&location=61.2181%2C-149.9003&radius=20000&region=US&key=${config.GOOGLE_PLACES_KEY}`, function(error, response, body){
            if (!error && response.statusCode == 200) {
                const geocodeData = JSON.parse(body)
                if (geocodeData.status != "OK") {
                    return geocodeData.status === 'ZERO_RESULTS'
                           ? reject(new NotFoundError("Address Not Found"))
                           : reject(new GeocoderError(geocodeData.status))
                }
                // filterning on types can help reduce noise
                const acceptable_types = [
                    'route',
                    'street_address',
                    'intersection',
                    'transit_station',
                    'point_of_interest',
                    'establishment',
                    'train_station',
                    'bus_station',
                    'neighborhood',
                    'premise'
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

/**
 * Find stops near given coordinates
 * @param {number} lat
 * @param {number} lon
 * @returns {array<StopData>}
 */
function findNearestStops(lat, lon) {
    const point = turf.point([+lon, +lat]);
    const out = gtfs.all_stops.features.reduce((acc, stop) => {
        const distance = turf_distance(point, stop, 'miles')

        if (distance <= config.NEAREST_BUFFER){
            const stopId = stop.properties.stop_id.match(/\d+/g)[0];
            acc.push({ route: stop.properties.name,
                       stopId: stopId,
                       distance: distance,
                       ll: [...stop.geometry.coordinates].reverse().join()
            });
        }
        return acc
    }, [])
    .sort((a, b) => (a.distance - b.distance))
    return out.length > config.NEAREST_MAX ? out.slice(0,config.NEAREST_MAX) : out
}

/**
 * Custom error to allow us to reject promises
 * but allow views to distinguish bewteen not-found rejects
 * and real errors.
 * @param {string} message
 */
function NotFoundError(message) {
    this.name = "Address not found"
    this.message = message
    this.stack = Error().stack
    this.type = 'NOT_FOUND'
}
NotFoundError.prototype = new Error;

/**
 * An real error from google
 * @param {string} message
 */
function GeocoderError(message) {
    this.name = "Geocoder Error"
    this.message = `An error occured while looking up this address: ${message}`
    this.stack = Error().stack
    this.type = 'GEOCODER_ERROR'
}
GeocoderError.prototype = new Error;


module.exports.stops_near_location = stops_near_location;
module.exports.findNearestStops = findNearestStops;
