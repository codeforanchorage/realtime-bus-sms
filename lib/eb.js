var bustracker_URL="http://bustracker.muni.org/InfoPoint/XML/"
var xml_file="vehiclelocation.xml"
var request = require('request'); // request.get(bustracker_url+xml_file)
var parser = require('xml2json');

function getLatestBusInfo (callback) {
    
    request(bustracker_URL+xml_file, function (err, response, body) {
        if (err) return callback(err)
        var parsed_data = JSON.parse(parser.toJson(body));
        var drill_down1 = parsed_data["vehicle-locations"]; // get the inner object
        delete drill_down1["report-generated"]; // remove this element from the object
        var drill_down2 = drill_down1["vehicle"];
        drill_down2.forEach(item => {
            if (item.name == '60303'){
                if(item['op-status'] == 'out-of-service' || item['op-status'] == 'not-in-service' || item['op-status'] == 'none'){
                    callback(null, 'The Electric Bus is not on the road right now, check back later!');
                } else {
                    callback(null, 'The Electric Bus is on route ' + item['routeid'] + ' and last stopped at ' + item['laststop']);
                }
            }
        })
    })
}

module.exports = {
    getLatestBusInfo: getLatestBusInfo
}