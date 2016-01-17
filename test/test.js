// Startup server
var port = 8080;
var app = require('../app');
var http = require('http');
app.set('port', port);
var server = http.createServer(app);
server.listen(port, '0.0.0.0');

//Setup client with automatic tests on each response
exports.setUp = function(done) {
    api = require('nodeunit-httpclient').create({
        port: port,
        // path: '/',   //Base URL for requests
        status: 200,    //Test each response is OK (can override later)
        // headers: {      //Test that each response must have these headers (can override later)
        //    'content-type': 'text/plain' }
    });
    done();
};


//Test the home page
exports.test_browserHome = function(test) {
    api.get(test, '/', function(res){
            test.ok(res.body.indexOf("When\'s the next bus?") > -1, "Test homepage heading");
            test.done()
        });

};

// Test an address entry
exports.test_browserAddressEntry = function(test) {
    api.post(test, '/ajax', {
            data: {Body: "5th Avenue"}
        }, function(res){
        test.ok(res.body.indexOf("5TH AVENUE & ") > -1, "Test simple address entry");
        test.done()
    });
};

// Test about
exports.test_browserAbout = function(test) {
    api.post(test, '/ajax', {
        data: {Body: "about"}
    }, function(res){
        test.ok(res.body.indexOf("Get bus ETAs") > -1, "Test about");
        test.done()
    });
};


function countTests(exports) {
    var count = 0;
    for(var key in exports) {
        if( key.match(/^test/) ) {
            count++;
        }
    }
    return count;
}

var total = 0, expectCount = countTests(exports);  //Part of a kludge to stop the server after all tests done
exports.tearDown = function(done) {
    if( ++total === expectCount ) {
        server.close()
    }
    done();
};

