// Server config
var port = 8080;
var app = require('../app');
var http = require('http');
app.set('port', port);
var server = http.createServer(app);

// Start server and create client
exports.setUp = function(done) {
    server.listen(port, '0.0.0.0');
    api = require('nodeunit-httpclient').create({
        port: port,
        status: 200    //Test each response is OK (can override later)
    });
    done();
};

exports.tearDown = function(done) {
        server.close();
   done();
};


exports.group = {
//Test the home page
    test_browserHome: function (test) {
        api.get(test, '/', function (res) {
            test.ok(res.body.indexOf("When\'s the next bus?") > -1, "Test homepage heading");
            test.done()
        });

    },

// Test an address entry
    test_browserAddressEntry: function (test) {
        api.post(test, '/ajax', {
            data: {Body: "5th Avenue"}
        }, function (res) {
            test.ok(res.body.indexOf("5TH AVENUE & ") > -1, "Test simple address entry");
            test.done()
        });
    },

// Test about
    test_browserAbout: function (test) {
        api.post(test, '/ajax', {
            data: {Body: "about"}
        }, function (res) {
            test.ok(res.body.indexOf("Get bus ETAs") > -1, "Test about");
            test.done()
        });
    }
};
