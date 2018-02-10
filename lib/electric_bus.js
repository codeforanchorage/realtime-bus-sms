var bustracker_URL="http://bustracker.muni.org/InfoPoint/XML/"
var xml_file="vehiclelocation.xml"
var request = require('request'); 
var parser = require('xml2json');

function getLatestBusInfo (callback) {
    
    request(bustracker_URL+xml_file, function (err, response, body) {
        if (err) return callback(err)
        var parsed_data = JSON.parse(parser.toJson(body));
        var bus_object = parsed_data['vehicle-locations'].vehicle.find(item => item.name == '60303') 
        const no_service_statuses = ['out-of-service', 'not-in-service', 'none']
            if (no_service_statuses.includes(bus_object['op-status'])){
                callback(null, 'The Electric Bus is not on the road right now, check back later!');
            } else {
                callback(null, 'The Electric Bus is on route ' + bus_object['routeid'] + ' and last stopped at ' + bus_object['laststop']);
            }
    })
}

module.exports = {
    getLatestBusInfo: getLatestBusInfo
}
