var request = require('request')
var http = require('http')
var querystring = require('querystring')
var stop_number_lookup = require('./stop_number_lookup')
var config = require('./config')

var muni_url = 'http://bustracker.muni.org/InfoPoint/departures.aspx?stopid='
var twilio = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);


/* This scrapes and  parses the stop data from the muni */
function getStopData(bustrackerId, callback) {
    request(muni_url + bustrackerId, function (error, response, body) {
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
        var bustrackerId = stop_number_lookup[stopId]

        res.writeHead(200, {'Content-Type': 'text/plain'})
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
    });
}).listen(8080)

console.log('Server running at http://127.0.0.1:8080/')
