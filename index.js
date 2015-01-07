/* TODO
logging
authenticate that requests are from twilio
use express middleware
*/

var request = require('request')
var http = require('http')
var querystring = require('querystring')
var stop_number_lookup = require('./stop_number_lookup')
// var config = require('./config')

// Used by node-geocoder - might need API for higher volume requests
var geocoderProvider = 'google';
var httpAdapter = 'http';
var extra = {formatter: 'json'};
// optional
/*var extra = {
    apiKey: 'YOUR_API_KEY', // for Mapquest, OpenCage, Google Premier
    formatter: null         // 'gpx', 'string', ...
};
*/
geocoder = require('node-geocoder').getGeocoder(geocoderProvider, httpAdapter, extra);

// I don't have a good grasp on scope and returning values or callbacks
// Trying to lump it all together
var city_state = ', Anchorage, Alaska'; //set default city to Anchorage Alaska seems to work for Eagle River as well.

function getClosestStop(address, callback) {
		geocoder.geocode(address+city_state, function(err, res) {
        lat = res[0].latitude;
        lon = res[0].longitude;
	    console.log(lat + ' ' + lon);
        carto_url_beg = 'http://brendanbabb.cartodb.com/api/v2/sql?q=SELECT%20bustracker_id%20FROM%20gtfs_bustracker_lat_long%20ORDER%20BY%20the_geom%20%3C-%3E%20CDB_LatLng(';
		carto_url_end = ')%20LIMIT%201&api_key=APIKEY';
		carto_url = carto_url_beg + lat + ',' + lon + carto_url_end;
		console.log(carto_url);
        request(carto_url, function (error, response, body) {
        	if (error || response.statusCode != 200) {
            	return callback(error || response.statusCode)
        	}
       	 	else {
            	//console.log(JSON.parse(body).rows[0].bustracker_id);
            	bus_id = JSON.parse(body).rows[0].bustracker_id;
            	console.log(bus_id);
            	getStopData(bus_id, callback)
        	}
		})
	})}

//address='Arctic and 19th, Anchorage, AK';
//y = getClosestStop(address);
        
var muni_url = 'http://bustracker.muni.org/InfoPoint/departures.aspx?stopid=';
// var twilio = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

    

/* This scrapes and  parses the stop data from the muni */
function getStopData(bustrackerId, callback) {
    request(muni_url + bustrackerId, function (error, response, body) {console.log('returned data from the muni')
        if (error || response.statusCode != 200) {
            return callback(error || response.statusCode)
        }
        else {
            var parsed = {
                stops: []
            };
            parsed.route = body.match(/<h1>(.*)<\/h1>/)[1]

            var regex = /<div class='(routeName|departure)'>([^<]+)<\/div>/g
            var stopsAndTimes = []
            while (matches = regex.exec(body)) {
                stopsAndTimes.push(matches[2])
            }

            var currentStop = null
            stopsAndTimes.forEach(function(stopOrTime) {
                if (stopOrTime === 'Done') {
                    currentStop.times.push(stopOrTime)
                }
                else if(stopOrTime.search(/[AP]M$/) === -1) {
                    currentStop = {
                        name: stopOrTime,
                        times: []
                    }
                    parsed.stops.push(currentStop)
                }
                else {
                    currentStop.times.push(stopOrTime.slice(0,-3))
                }
            })

            callback(null, formatStopData(parsed))
        }
    })
}


/* This determines the formatting of the text message */
function formatStopData(jsonData) {
    // console.dir(jsonData)
    var out = '* ' + jsonData.route + ' *\n\n'

    jsonData.stops.forEach(function(stop) {
        out += stop.name + '\n'
        out += stop.times.join(', ') + '\n\n'
    })

    return out.trim()
}


/* This creates the server and handles requests */
http.createServer(function (req, res) {
    var fullBody = ''
    req.on('data', function(chunk) {
        // append the current chunk of data to the fullBody variable
        fullBody += chunk.toString();
    });

    req.on('end', function() {
        var decodedBody = querystring.parse(fullBody)
        var stopId = parseInt(decodedBody.Body)
        
        res.writeHead(200, {'Content-Type': 'text/plain'})

    	if (isNaN(stopId)) {
    		getClosestStop(decodedBody.Body, function(err, data) {
                console.log('Good input')
                console.dir(decodedBody)
                return res.end(data)
            })
    	}
    	else {
	        var bustrackerId = stop_number_lookup[stopId]
		    
	        if (!bustrackerId) {
	            console.log('Bad input')
	            console.dir(decodedBody)
	            return res.end('Invalid stop number')
	        }
	    	else {
	            getStopData(bustrackerId, function(err, data) {
	                console.log('Good input')
	                console.dir(decodedBody)
	                return res.end(data)
	            })	
	        }	
    	}
    });
}).listen(8080)

console.log('Server running at http://127.0.0.1:8080/')
