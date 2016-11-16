// Server config
var port = 8080;
var app = require('../app');
var http = require('http');
app.set('port', port);
var server = http.createServer(app);

var config = require('../lib/config');
var stop_number_lookup = require('../lib/stop_number_lookup');
var hashwords = require('hashwords')();
var fs = require('fs');
var crypto = require('crypto');



// Helper functions
function testFeedback(test, res, feedbackString, phone, email) {
    test.ok(res.body.indexOf("Thanks for the feedback") > -1, "Test feedback response");
    var comments = JSON.parse(fs.readFileSync('./comments.json'));
    test.ok(function() {
        for(var i=0; i < comments.comments.length; i++) {
            if (comments.comments[i].feedback && comments.comments[i].feedback.indexOf(feedbackString) > -1) {
                if (phone) {
                    if (comments.comments[i].phone == phone) {
                        return true
                    } else {
                        return false
                    }
                }
                if (email) {
                    if (comments.comments[i].email == email) {
                        return true
                    } else {
                        return false
                    }
                }
                return true
            }
        }
        return false
    } (), "Test feedback log");
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
    test.ok(res.body.indexOf("Stop " + stopId) > -1, "Test stop ID entry");
    test.done()
}

function testBrowserStopId(test, res, stopId) {
    test.ok(res.body.indexOf("stop<br /> " + stopId) > -1, "Test stop ID entry");
    test.done()
}

function testOutage(test, res) {
    console.log("BODY: ",res.body)
    test.ok(res.body.indexOf("Bustracker is down") > -1, "Test outage");
    test.done()
}

function testLogging(test, res, input, phone) {
    var db = JSON.parse(fs.readFileSync('./public/db.json'));
    test.ok(function() {
        for(var i=0; i < db.requests.length; i++) {
            if (db.requests[i].input == input ) {
                if (phone) {
                    if (db.requests[i].phone == hashwords.hashStr(phone)) {
                        return true
                    } else {
                        return false
                    }
                } else {
                    return true
                }
            }
        }
        return false
    } (), "Test public log");
    db = JSON.parse(fs.readFileSync('./db_private.json'));
    test.ok(function() {
        for(var i=0; i < db.requests.length; i++) {
            console.log(db.requests[i].input);
            if (db.requests[i].input == input ) {
                if (phone) {
                    if (db.requests[i].phone == phone) {
                        return true
                    } else {
                        return false
                    }
                } else {
                    return true
                }
            }
        }
        return false
    } (), "Test private log");
    test.done();
}


exports.group = {
    // Start server and create client
    setUp: function (done) {
        server.listen(port, '0.0.0.0');
        api = require('nodeunit-httpclient').create({
            port: port
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
            test.ok(res.body.indexOf("When’s the<br />next bus?") > -1, "Test homepage heading");
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
            testBrowserStopId(test, res, stopId)
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

// Alternate stopId combos (Assume browser same as SMS)
    test_smsHashStopId: function (test) {
        for (var stopId in stop_number_lookup) break;
        var altStopId = "#" + stopId;
        api.post(test, '/', {
            data: {Body: altStopId}
        }, function (res) {
            testStopId(test, res, stopId)
        });
    },
    test_smsHashSpaceStopId: function (test) {
        for (var stopId in stop_number_lookup) break;
        var altStopId = "# " + stopId;
        api.post(test, '/', {
            data: {Body: altStopId}
        }, function (res) {
            testStopId(test, res, stopId)
        });
    },
    test_smsHashZeroStopId: function (test) {
        for (var stopId in stop_number_lookup) break;
        var altStopId = "#00" + stopId;
        api.post(test, '/', {
            data: {Body: altStopId}
        }, function (res) {
            testStopId(test, res, stopId)
        });
    },
    test_smsStopHashStopId: function (test) {
        for (var stopId in stop_number_lookup) break;
        var altStopId = "Stop # " + stopId;
        api.post(test, '/', {
            data: {Body: altStopId}
        }, function (res) {
            testStopId(test, res, stopId)
        });
    },
    test_smsStopStopId: function (test) {
        for (var stopId in stop_number_lookup) break;
        var altStopId = "Stop" + stopId;
        api.post(test, '/', {
            data: {Body: altStopId}
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

// Test logging
    test_smsLogging: function (test) {
        var input = (Math.random().toString(36)+'00000000000000000').slice(2, 12);  // Input 12 random characters just to get something logged
        var phone = "608-432-5799";
        api.post(test, '/', {
            data: {Body: input,
                From: phone}
        }, function (res) {
            setTimeout(function () {testLogging(test, res, input, phone)}, 5000);  //Delay to make sure logging saves
        });
    },
    test_browserLogging: function (test) {
        var input = (Math.random().toString(36)+'00000000000000000').slice(2, 12);  // Input 12 random characters just to get something logged
        api.post(test, '/ajax', {
            data: {Body: input}
        }, function (res) {
            setTimeout(function () {testLogging(test, res, input)}, 5000);  //Delay to make sure logging saves
        });
    },

// Log Plots
    //Test the plot page
    test_plotHome: function (test) {
        api.get(test, '/logplot', function (res) {
            test.ok(res.body.indexOf("Logs") > -1, "Test log plot heading");
            test.done()
        });

    },

    test_getLogData: function (test) {
        api.get(test, '/logData/', {
            data: {type: "hits",
                   daysBack: "20"}
        }, function(res) {
            var logData = JSON.parse(res.body);
            test.ok(logData.length > 0, "Have log data");
            var sampleRequest = logData[0];
            test.ok(sampleRequest.hasOwnProperty('type'), "Type present (Browser or SMS)");
            test.ok(sampleRequest.hasOwnProperty('date'), "Date present");
            test.ok(sampleRequest.hasOwnProperty('totalTime'), "Total response time present");
            test.ok(sampleRequest.hasOwnProperty('muniTime'), 'Muni response time present');
            test.ok(sampleRequest.hasOwnProperty('userId'), 'User identifier present');
            test.done();
        });
    },

// Test feedback
    test_browserFeedback: function (test) {
        var feedbackString = "Test Feedback " + (new Date().toISOString());
        var email = "test@example.com";
        api.post(test, '/feedback', {
            data: {comment: feedbackString,
                   email: email}
        }, function (res) {
            setTimeout(function () {testFeedback(test, res, feedbackString, null, email)}, 5000);  //Delay to make sure logging saves
        });
    },
    test_smsFeedback: function (test) {
        var feedbackString = "Test Feedback " + (new Date().toISOString());
        var phone = "608-432-5799";
        api.post(test, '/', {
            data: {Body: config.FEEDBACK_TRIGGER + feedbackString,
                From: phone}
        }, function (res) {
            setTimeout(function () {testFeedback(test, res, feedbackString, phone)}, 5000);  //Delay to make sure logging saves
        });

    },
    test_feedbackResponseValidGet: function(test) {
        var comments = JSON.parse(fs.readFileSync('./comments.json'));
        for (var i = comments.comments.length - 1; i >= 0; i--) {  // Find a feedback to respond to
            if (comments.comments[i].phone && comments.comments[i].response_hash) {
                api.get(test, "/respond?hash=" + comments.comments[i].response_hash, function (res) {   // Respond to the feedback
                    console.log("Checking response page");
                    test.ok((res.statusCode == 200) && (res.body.indexOf("feedback") > -1), "Should render a page on valid get for feedback response");
                    test.done();
                });
                return
            }
        }
    },

    test_feedbackResponseInvalidGet: function(test) {
        var response_hash = crypto.randomBytes(20).toString('hex');
        api.get(test, "/respond?hash=" + response_hash, function (res) {   // Respond to the feedback
            test.ok(res.statusCode == 404, "Invalid get for feedback response should produce 404")
            test.done();
        })
    },

    test_feedbackResponsePost: function(test) {
        var comments = JSON.parse(fs.readFileSync('./comments.json'));
        var response = "Glad you liked it!" + crypto.randomBytes(20).toString('hex');
        var foundOne = false;
        console.log("Searching for feedback to use");
        for (var i = comments.comments.length - 1; i >= 0 && !foundOne; i--) {  // Find a feedback to respond to
            if (comments.comments[i].phone && comments.comments[i].response_hash) {
                foundOne = true;
                console.log("Posting reponse")
                api.post(test,"/respond", {
                    data: {hash: comments.comments[i].response_hash,
                           response: response}
                    }, function(res) {
                        setTimeout(function () {   // Did we log our response?
                            test.ok(function() {
                                console.log("Checking for reponse in log");
                                for (var j = comments.comments.length-1; j >= 0 ; j--) {
                                    if (comments.comments[j].response && comments.comments[j].response.indexOf(response) > -1) {
                                        console.log("Got right response in log")
                                        return true;
                                    }
                                }
                                return false
                            });
                            test.done();
                        }, 5000);  //Delay to make sure logging saves
                });
            }
        }
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
    },

// Bustracker failure
    test_browserNetworkFailure: function(test) {
        config.MUNI_URL = '';
        for (var stopId in stop_number_lookup) break;
        api.post(test, '/', {
            data: {Body: stopId}
        }, function (res) {
            testOutage(test, res)
        });
    },
    test_smsNetworkFailure: function(test) {
        config.MUNI_URL = '';
        for (var stopId in stop_number_lookup) break;
        api.post(test, '/', {
            data: {Body: stopId}
        }, function (res) {
            testOutage(test, res)
        });
    },
    test_browserOutage: function(test) {
        config.MUNI_URL = "http://bustracker.muni.org/InfoPoint/departure.aspx?stopid=";  //"departures.aspx" spelled wrong
        for (var stopId in stop_number_lookup) break;
        api.post(test, '/ajax', {
            data: {Body: stopId}
        }, function (res) {
            testOutage(test, res)
        });
    },
    test_smsOutage: function(test) {
        config.MUNI_URL = "http://bustracker.muni.org/InfoPoint/departure.aspx?stopid=";  //"departures.aspx" spelled wrong
        for (var stopId in stop_number_lookup) break;
        api.post(test, '/', {
            data: {Body: stopId}
        }, function (res) {
            testOutage(test, res)
        });
    }


};

