// Server config
var port = 8080;
var app = require('../app');
var http = require('http');
app.set('port', port);
var server = http.createServer(app);
var config = require('../lib/config');
var stop_number_lookup = require('../lib/stop_number_lookup');

// Helper functions
function testFeedback(test, res, feedbackString) {
    test.ok(res.body.indexOf("Thanks for the feedback") > -1, "Test feedback response");
    var comments = require('../comments.json');
    test.ok(function() {
        for(var i=0; i < comments.length; i++) {
            if (comments[i].indexOf(feedbackString) > -1) {
                return true
            }
        }
        return false
    }, "Test feedback log");
    test.done();
}

function testAbout(test, res) {
    test.ok(res.body.indexOf("Get bus ETAs") > -1, "Test about");
    test.done()
}

function testAddress(test, res, address) {
    test.ok(res.body.indexOf(address.toUpperCase() + " & ") > -1, "Test simple address entry");
    test.done()
}

function testStopId(test, res, stopId) {
    test.ok(res.body.indexOf("stop #" + stopId) > -1, "Test stop ID entry");
    test.done()
}

function testOutage(test, res) {
    console.log(res.body);
    test.ok(res.body.indexOf("Bustracker is down") > -1, "Test outage");
    test.done()
}


exports.main_group = {
    // Start server and create client
    setUp: function (done) {
        server.listen(port, '0.0.0.0');
        api = require('nodeunit-httpclient').create({
            port: port,
            status: 200    //Test each response is OK (can override later)
        });
        done();
    },

    tearDown: function (done) {
        server.close();
        done();
    },

//Test the home page
    test_browserHome: function (test) {
        api.get(test, '/', function (res) {
            test.ok(res.body.indexOf("When\'s the next bus?") > -1, "Test homepage heading");
            test.done()
        });

    },

// Test an address entry
    test_browserAddressEntry: function (test) {
        var address = "5th Avenue";
        api.post(test, '/ajax', {
            data: {Body: address}
        }, function (res) {
            testAddress(test, res, address)
        });
    },
    test_smsAddressEntry: function (test) {
        var address = "5th Avenue";
        api.post(test, '/', {
            data: {Body: address}
        }, function (res) {
            testAddress(test, res, address)
        });
    },

// Test Stop ID (Hard-coded stopIds should probably be read from list)
    test_browserStopId: function (test) {
        for (var stopId in stop_number_lookup) break;
        api.post(test, '/ajax', {
            data: {Body: stopId}
        }, function (res) {
            testStopId(test, res, stopId)
        });
    },
    test_smsStopId: function (test) {
        for (var stopId in stop_number_lookup) break;
        api.post(test, '/', {
            data: {Body: stopId}
        }, function (res) {
            testStopId(test, res, stopId)
        });
    },

// Test about
    test_browserAbout: function (test) {
        api.post(test, '/ajax', {
            data: {Body: "about"}
        }, function (res) {
            testAbout(test, res)
        });
    },
    test_smsAbout: function (test) {
        api.post(test, '/', {
            data: {Body: "about"}
        }, function (res) {
            testAbout(test, res)
        });
    },

// Test feedback
    test_browserFeedback: function (test) {
        var feedbackString = "Test Feedback " + (new Date().toISOString());
        api.post(test, '/feedback', {
            data: {comment: feedbackString}
        }, function (res) {
            testFeedback(test, res, feedbackString)
        });
    },
    test_smsFeedback: function (test) {
        var feedbackString = "Test Feedback " + (new Date().toISOString());
        api.post(test, '/', {
            data: {Body: config.FEEDBACK_TRIGGER + feedbackString}
        }, function (res) {
            testFeedback(test, res, feedbackString)
        });

    },

// Test latlon
    test_browserLatLon: function (test) {
        api.get(test, '/byLatLon', {
            data: {
                lat: "61.217572",
                lon: "-149.886450"
            }
        }, function (res) {
            console.log(res.body)
            test.ok(res.body.indexOf("5TH AVENUE") > -1, "Test lat-long");
            test.done()
        });
    }
};

exports.outage_group = {
    // Start server and create client
    setUp: function (done) {
        config.MUNI_URL = "http://bustracker.muni.org/InfoPoint/departure.aspx?stopid=";  //"departures.aspx" spelled wrong
        console.log(config.MUNI_URL);
        server.listen(port, '0.0.0.0');
        api = require('nodeunit-httpclient').create({
            port: port,
            status: 200    //Test each response is OK (can override later)
        });
        done();
    },

    tearDown: function (done) {
        server.close();
        done();
    },


// Test Muni outage
    test_browserOutage: function(test) {
        for (var stopId in stop_number_lookup) break;
        api.post(test, '/ajax', {
            data: {Body: stopId}
        }, function (res) {
            testOutage(test, res)
        });
    },
    test_smsOutage: function(test) {
        for (var stopId in stop_number_lookup) break;
        api.post(test, '/', {
            data: {Body: stopId}
        }, function (res) {
            testOutage(test, res)
        });
    }
};

