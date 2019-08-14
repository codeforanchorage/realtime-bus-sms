'use strict';

const config = require('./config')
const http = require('http')
const logger = require('./logger')
const gtfs = require('./gtfs')
const moment = require('moment-timezone')

moment.tz.setDefault(config.TIMEZONE)

/**
 * This module is accepts a stop id and returns an object with information
 * about the next buses that will arrive at the stop. It makes requests to the muni's
 * info point and parses the returned html.
 * @module lib/bustracker
 */

/**
 * @typedef StopData
 * @property {number} muniTime              - a measure of how long the muni site took to respond to our request
 * @property {object} data
 * @property {string} data.stop             - the name of the requested stop
 * @property {number} data.stopId           - the number of the requested stop
 * @property {array<BusData>} data.stops    - list of buses that will arrive at the stop and their times
 */

/**
 * @typedef BusData
 * @property {string} name          - Route Name
 * @property {number} number        - Route Number
 * @property {array<string>} times  - List of upcoming times
 */

/**
 * Get info about the next bus to arrive at a stop
 * @param {string} stopId   - The stop number (the ones on the sign)
 * @returns {Promise<StopData>}
 */
function getStopFromStopNumber(stopId) {
   logger.error("there was a plain text test error", {someKey: "Some Value"})
    const busTrackerURL = gtfs.stop_number_url[stopId];
    if (!busTrackerURL) {
        const err = new Error("Stop numbers are on the bus stop sign (you can skip leading zeroes). If you can't find the stop number, send an address or intersection.")
        err.name = `I couldn't find stop number ${stopId}`
        return Promise.reject(err)
    }
    return requestBusData(busTrackerURL)
        .then(muniBusData => ({data: parseBusData(muniBusData.data, stopId), muniTime:muniBusData.asyncTime}))
        .catch((err) => Promise.reject(new Error('Sorry, Bustracker is down')))
}

/**
 * Makes request to muni info point for stop info.
 *
 * @param {number} busTrackerId
 * @returns {Promise<{data: string, asyncTime: number}>}
 */
function requestBusData(busTrackerURL) {
    return new Promise((resolve, reject) => {
        let asyncTime =  Date.now()
        const request = http.get(busTrackerURL, response => {
            if (response.statusCode < 200 || response.statusCode > 299) {
                logger.error(new MuniError(`Muni Server returned status code: ${response.statusCode}`))
                reject(new Error('Failed to load bustracker, status code: ' + response.statusCode));
            }
            const body = [];
            response.on('data', chunk => body.push(chunk));
            response.on('end', () => {
                resolve({
                    data: body.join(''),
                    asyncTime: Date.now() - asyncTime
                });
            });
        });
        request.on('error', (err) => (logger.error(err), reject(err)))
    })
};

/**
 * Parse the html from the muni info point into a useable data structure
 * @private
 * @param {String} body   - the html returned by the muni info point
 * @param {number} stopId - the stop number (from the bus signs)
 * @returns {BusData}
 */
function parseBusData(body, stopId) {
    /* see ../test/fixtures/muniResponse.js for examples of muni response */
    const parsed = {
        stops: []
    };

    const stop = body.match(/<h1>(.*)<\/h1>/)
    if (stop == null) {
        const err = new MuniError('Unexpected result from Muni. Cannot parse returned value.');
        logger.error(err, {htmlBody: body, stopID: stopId});
        throw err;
    }
    parsed.stop = stop[1];

    parsed.stop = parsed.stop.replace(/: (\d*)/, '') // We only want the name - the route number is appended to some but not all routes.
    parsed.stopId = stopId;

    const regex = /<div class='(routeName|departure)'>([^<]+)<\/div>/g

    let currentStop, matches;
    while (matches = regex.exec(body)) {
        if (matches[1] === 'routeName'){
            let routeObject = prependRouteNumberToRouteName(matches[2]);
            currentStop = {
                name: routeObject.routeName,
                number:routeObject.routeNumber,
                times: []
            }
            parsed.stops.push(currentStop)
        } else {
            let a_time = matches[2]
            if (a_time === 'Done'){
                currentStop.times.push( 'Out of Service')
            } else {
                // workaround for bug in moment where after midnight UTC parsing local
                // times returns the incorrect day: https://github.com/moment/moment-timezone/issues/119
                let todayDate = moment().format('YYYY-MM-DD')
                let time = moment(`${todayDate} ${a_time}`, 'YYYY-MM-DD h:mm A')
                let now = moment()
                if (time > now) {
                    currentStop.times.push(time.format('h:mm A'))
                }
            }
        }
    }
    return parsed;
}

/**
 * Break route name strings from muni into number and name
 * @private
 * @param {string} routeName
 * @returns {object<{routeNumber: string,routeName: string}>}
 */
function prependRouteNumberToRouteName(routeName) {
    if (!routeName || routeName=='') return routeName;
    let [routeNumber, nameOnly] = routeName.split(/(^\d+)\s+/).filter(item => item);
    return routeNumber ? {routeNumber: routeNumber, routeName: nameOnly} : {routeName: routeName}
}


function MuniError(message) {
    this.name = "Muni Server Error"
    this.message = message
    this.stack = Error().stack
    this.type = 'MUNI_ERROR'
}
MuniError.prototype = new Error;

module.exports.getStopFromStopNumber = getStopFromStopNumber;
