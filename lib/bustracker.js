const config = require('./config'),
      http = require('http'),
      moment = require('moment-timezone'),
      logger = require('./logger'),
      routeNamesToRouteNumbers = require('./routename_to_routenumber'),
      stop_number_lookup = require('./stop_number_lookup'),
      exceptions = require('../gtfs/geojson/exceptions.json')


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
    .then(muniBusData => ({data: parseBusData(muniBusData.data, stopId), muniTime:muniBusData.asyncTime}))
    .catch((err) => Promise.reject(new Error('Sorry, Bustracker is down')))
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
        var request = http.get(config.MUNI_URL + busTrackerId, response => {
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
        var err = new MuniError('Unexpected result from Muni. Cannot parse returned value.');
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
    stopsAndTimes.forEach(stopOrTime => {
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

function serviceExceptions() {
    // Check for holiday exceptions
    var dateTz = moment.tz(new Date(), config.TIMEZONE).format("YYYYMMDD");
    return exceptions.exceptions.some(exception => exception.date == dateTz && exception.exception_type == 2 )
}

function MuniError(message) {
    this.name = "Muni Server Error"
    this.message = message
    this.stack = Error().stack
    this.type = 'MUNI_ERROR'
}
MuniError.prototype = new Error;

module.exports.getStopFromStopNumber = getStopFromStopNumber;
module.exports.serviceExceptions = serviceExceptions;