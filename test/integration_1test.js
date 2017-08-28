'use strict';

const   supertest = require('supertest'),
        assert = require('assert'),
        sinon = require('sinon'),
        nock = require('nock'),
        app = require('../app'),
        config = require('../lib/config'),
        { URL } = require('url'),
        muniURL = new URL(config.MUNI_URL),
        stop_number_lookup = require('../lib/stop_number_lookup'),
        http = require('http'),
        logger = require('../lib/logger'),
        exceptions = require('../gtfs/geojson/exceptions.json'),
        moment = require('moment-timezone'),
        muniResponses = require('./fixtures/muniResponse'),
        geocodeResponses = require('./fixtures/googleMapsResponses'),
        watsonResponses = require('./fixtures/watson_context'),
        onFinished = require('on-finished'),
        hashwords = require('hashwords')();

let request = supertest(app)
app.enable('view cache')

logger.transports['console.info'].silent = true

describe("Routes", function(){
    before(() => {
        logger.transports['console.info'].silent = true
        logger.transports['Local-Logs'].silent = true
    })
    after(() => {
        logger.transports['console.info'].silent = false
        logger.transports['Local-Logs'].silent = false
    })

    describe("POST '/'", function(){
        afterEach(function(){
            nock.cleanAll()
        })
        it('Should save Feedback from SMS', function(done){
            const feedback = "test Feedback - " + Date.now().toString(36),
                from =  Date.now().toString(8).slice(3)
            request.post('/')
            .send({Body: 'Feedback:' + feedback, From:from})
            .expect(/^Thanks for the feedback/)
            .expect(res => {
                let comments = JSON.parse(fs.readFileSync('./comments.json'))
                let last_comment = comments.comments[comments.comments.length-1]
                assert.equal(last_comment.feedback, feedback)
                assert.equal(last_comment.phone, from)
            })
            .end((err, res) => done(err))
        })

        it('Should sanitize messy input', function(done){
            request.post('/')
            .send({Body: ' ✊🏻   ABOUT \n 💋'})
            .expect(/Get bus ETAs/)
            .end((err, res) =>  done(err))
        })
        it('Should check service exceptions', function(done){
            const anException = exceptions.exceptions.find(ex => ex.exception_type == 2)
            const clock = sinon.useFakeTimers(moment.tz(anException.date, 'YYYYMMDD', config.TIMEZONE).valueOf())
            request.post('/')
            .send({Body:"1066"})
            .expect(/^Holiday/)
            .end((err, res) =>  (clock.restore(), done(err)))
        })
        it('Should respond to blank input', function(done){
            request.post('/')
            .send("")
            .expect(/^No input/)
            .end((err, res) => done(err))
        })
        it('Should respond to non existent stops', function(done){
            request.post('/')
            .send({Body: '1'})
            .expect(/^I couldn't find/)
            .end((err, res) => done(err))
        })
        it('Should respond to About requests', function(done){
            request.post('/')
            .send({Body: 'About'})
            .expect(/^Get bus ETAs/)
            .end((err, res) =>  done(err))
        })
        it('Should deliver stops to SMS requests with stop number', function(done){
            const stop_number = "2051"
            nock(muniURL.origin).get(muniURL.pathname).query({stopid: 1477}).reply(200, muniResponses.goodResponse )
            request.post('/')
            .send({Body: stop_number})
            .expect(/^\* Stop/)
            .expect((res) =>{
                var lines = res.text.split('\n')
                assert(lines[0].includes(stop_number), "Results didn't include the stop number")
                assert.equal(lines[1],  '  2 LAKE OTIS - Outbound - 12:49 PM')
            })
            .end((err, res) => done(err))
        })
        it('Should deliver nearest stops to SMS requests with address ', function(done){
            const address = "632 W 6th Ave"
            nock('https://maps.googleapis.com')
            .get('/maps/api/geocode/json')
            .query({
                address: address, // nock seems to URI encode this for us
                components: `country:US|administrative_area:${config.GOOGLE_GEOCODE_LOCATION}`,
                key: config.GOOGLE_MAPS_KEY
            })
            .reply(200, geocodeResponses.goodResponse)
            request.post('/')
            .send({Body: address})
            .expect(/^Enter/)
            .expect(/CITY HALL/)
            .end((err, res) => done(err))
        })
        it('Should Ask Watson if geocoder fails to find an address', function(done){
            const query = "How does this work?"
            nock('https://maps.googleapis.com').get(/.*/).query(true)
            .reply(200, geocodeResponses.nonspecificResponse)

            nock('https://gateway.watsonplatform.net')
            .post(/\/conversation\/api\/v1\/workspaces/)
            .query({
                version:'2017-05-26',
            })
            .reply(200, watsonResponses.greeting)

            request.post('/')
            .send({Body: query})
            .expect(/^Greetings/)
            .end((err, res) => done(err))
        })
    })

    describe("POST /ajax", function(){
        it('Should sanitize messy input', function(done){
            request.post('/ajax')
            .send({Body: ' ABO🌈UT ✊🏻   \n    🦑'})
            .expect(/<div.*Get bus ETAs/)
            .end((err, res) =>  done(err))
        })
        it('Should check service exceptions', function(done){
            const anException = exceptions.exceptions.find(ex => ex.exception_type == 2)
            const clock = sinon.useFakeTimers(moment.tz(anException.date, 'YYYYMMDD', config.TIMEZONE).valueOf())
            request.post('/ajax')
            .send({Body:"1066"})
            .expect(/<div.*Holiday/)
            .end((err, res) =>  (clock.restore(), done(err)))
        })
        it('Should respond to blank input', function(done){
            request.post('/ajax')
            .send("")
            .expect(/<div.*No input/)
            .end((err, res) => done(err))
        })
        it('Should respond to About requests', function(done){
            request.post('/ajax')
            .send({Body: 'About'})
            .expect(/<div.*How this works/)
            .end((err, res) =>  done(err))
        })
        it('Should deliver stops from requests with stop number', function(done){
            const stop_number = "2051"
            nock(muniURL.origin).get(muniURL.pathname).query({stopid: "1477"}).reply(200, muniResponses.goodResponse )
            request.post('/ajax')
            .send({Body: stop_number})
            .expect(/<div .* 2051/)
            .expect(/DOWNTOWN TRANSIT CENTER/)
            .expect(/LAKE OTIS/)
            .end((err, res) => done(err))
        })
        it('Should deliver nearest stops to requests with address ', function(done){
            const address = "632 W 6th Ave"
            nock('https://maps.googleapis.com')
            .get('/maps/api/geocode/json')
            .query({
                address: address, // nock seems to URI encode this for us
                components: `country:US|administrative_area:${config.GOOGLE_GEOCODE_LOCATION}`,
                key: config.GOOGLE_MAPS_KEY
            })
            .reply(200, geocodeResponses.goodResponse)
            request.post('/ajax')
            .send({Body: address})
            .expect(/<div.*Enter/)
            .expect(/CITY HALL/)
            .end((err, res) => done(err))
        })
        it('Should Ask Watson if geocoder fails to find an address', function(done){
            const query = "How does this work?"
            nock('https://maps.googleapis.com').get(/.*/).query(true)
            .reply(200, geocodeResponses.nonspecificResponse)

            nock('https://gateway.watsonplatform.net')
            .post(/\/conversation\/api\/v1\/workspaces/)
            .query({
                version:'2017-05-26',
            })
            .reply(200, watsonResponses.greeting)

            request.post('/ajax')
            .send({Body: query})
            .expect(/<div.*Greetings/)
            .end((err, res) => done(err))
        })
    })

    describe("GET /find/about", function(){
        it('Should send full webpage when About page is directly accessed', function(done){
            request.get('/find/about')
            .expect(/^<!DOCTYPE/)
            .expect(/How this works/)
            .end((err, res) =>  done(err))
        })
    })
    describe("GET /find/:query", function(){
        it('Should check service exceptions', function(done){
            const anException = exceptions.exceptions.find(ex => ex.exception_type == 2)
            const clock = sinon.useFakeTimers(moment.tz(anException.date, 'YYYYMMDD', config.TIMEZONE).valueOf())
            request.get('/find/1066')
            .expect(/<div.*Holiday/)
            .end((err, res) =>  (clock.restore(), done(err)))
        })
        it('Should send the index page when given no input', function(done){
            request.get('/find/ ')
            .expect(/^<!DOCTYPE/)
            .expect(/How this works/)
            .end((err, res) => done(err))
        })
        it('Should send full webpage with results for URL query with stop number', function(done){
            nock(muniURL.origin).get(muniURL.pathname).query({stopid: "1477"}).reply(200, muniResponses.goodResponse )
            request.get('/find/2051')
            .expect(/^<!DOCTYPE/)
            .expect(/DOWNTOWN TRANSIT CENTER/)
            .expect(/LAKE OTIS/)
            .end((err, res) =>  done(err))
        })
        it('Should send full webpage with results for URL query with address', function(done){
            let address = '5th and G street'
            nock('https://maps.googleapis.com')
            .get('/maps/api/geocode/json')
            .query({
                address: address, // nock seems to URI encode this for us
                components: `country:US|administrative_area:${config.GOOGLE_GEOCODE_LOCATION}`,
                key: config.GOOGLE_MAPS_KEY
            })
            .reply(200, geocodeResponses.goodResponse)

            request.get('/find/' + address)
            .expect(/^<!DOCTYPE/)
            .expect(/DOWNTOWN TRANSIT CENTER/)
            .end((err, res) =>  done(err))
        })
        it('Should send full webpage with Watson results for other queries', function(done){
            nock('https://maps.googleapis.com').get(/.*/).query(true).reply(200, geocodeResponses.nonspecificResponse)
            nock('https://gateway.watsonplatform.net').post(/.*/).query(true).reply(200, watsonResponses.greeting)

            request.get("/find/What's%20up")
            .expect(/^<!DOCTYPE/)
            .expect(/Greetings./)
            .end((err, res) =>  done(err))
        })
    })
    describe("GET /byLatLon", function() {
        it('Should check service exceptions', function(done){
            const anException = exceptions.exceptions.find(ex => ex.exception_type == 2)
            const clock = sinon.useFakeTimers(moment.tz(anException.date, 'YYYYMMDD', config.TIMEZONE).valueOf())
            request.get('/byLatLon?lat=61.217571&lon=-149.895208')
            .expect(/^Holiday/)
            .end((err, res) =>  (clock.restore(), done(err)))
        })
        it('Should not return routes for distant location', function(done){
            request.get('/byLatLon?lat=52.520007&lon=13.404954')
            .expect(/No stops found/)
            .end((err, res) =>  done(err))
        })
        it('Should return a message when location is not available', function(done){
            request.get('/byLatLon')
            .expect(/Can't determine your location/)
            .end((err, res) =>  done(err))
        })
    })
    describe("POST /feedback", function(){
        it('Should save Feedback from Web', function(done){
            const feedback = "test Feedback - " + Date.now().toString(36),
                email =  "test@" + Date.now().toString(36) + ".com"
            request.post('/feedback')
            .send({comment: feedback, email:email})
            .expect(/<div.*Thanks for the feedback/)
            .expect(res => {
                let comments = JSON.parse(fs.readFileSync('./comments.json'))
                let last_comment = comments.comments[comments.comments.length-1]
                assert.equal(last_comment.feedback, feedback)
                assert.equal(last_comment.email, email)
            })
            .end((err, res) => done(err))
        })
    })
})

describe("Logging hits", function(){
    const publicDB = './public/db.json',
          privateDB = './db_private.json'
    before(() => logger.transports['console.info'].silent = true)
    after(() => logger.transports['console.info'].silent = false)

    it('Should log SMS requests to private db', function(done){
        let from = "testPhone: " + Date.now().toString(8).slice(3),
            stop = "1066"
        nock(muniURL.origin).get(muniURL.pathname).query({stopid: "2124"}).reply(200, muniResponses.goodResponse )
        request.post('/')
        .send({Body: stop, From: from})
        .end((err, res) => {
            if (err) done(err)
            try{
                let watcher = fs.watch(privateDB, (eventType, filename) => {
                    let private_log = JSON.parse(fs.readFileSync(privateDB)).requests
                    let last_entry = private_log[private_log.length-1]
                    assert.equal(last_entry.phone, from)
                    watcher.close()
                    done()
                })
            } catch(e) {
                assert.fail("couldn't find private db")
                done(e)
            }
        })
    })
    it('Should log SMS requests to public db', function(done){
        let from = "testPhone: " + Date.now().toString(8).slice(3),
            stop = "2051"

        nock(muniURL.origin).get(muniURL.pathname).query({stopid: stop}).reply(200, muniResponses.goodResponse )
        request.post('/')
        .send({Body: stop, From: from})
        .end((err, res) => {
            if (err) done(err)
            try{
                let watcher = fs.watch(publicDB, (eventType, filename) => {
                    let private_log = JSON.parse(fs.readFileSync(publicDB)).requests
                    let last_entry = private_log[private_log.length-1]
                    assert.equal(last_entry.phone, hashwords.hashStr(from))
                    watcher.close()
                    done()

                })
            } catch(e) {
                assert.fail("couldn't find private db")
                done(e)
            }
        })
    })
    it('Should log web requests to private db', function(done){
        let  input = "Test query" + Date.now().toString(36),
             ip = [0,0,0].reduce((acc, cur) => acc + "." + Math.floor(Math.random() * (256)), "10")
        nock('https://maps.googleapis.com').get(/.*/).query(true).reply(200, geocodeResponses.nonspecificResponse)
        nock('https://gateway.watsonplatform.net').post(/.*/).query(true).reply(200, watsonResponses.greeting)

        request.post('/')
        .set('X-Forwarded-For', ip)
        .send({Body: input})
        .end((err, res) => {
            if (err) done(err)
            try{
                let watcher = fs.watch(privateDB, (eventType, filename) => {
                    let private_log = JSON.parse(fs.readFileSync(privateDB)).requests
                    let last_entry = private_log[private_log.length-1]
                    assert.equal(last_entry.input,input)
                    assert.equal(last_entry.ip,ip)
                    watcher.close()
                    done()

                })
            } catch(e) {
                assert.fail("couldn't find private db")
                done(e)
            }
        })
    })
    it('Should log web requests to public db (without ip)', function(done){
        let from = "testPhone: " + Date.now().toString(8).slice(3),
            input = "Test query" + Date.now().toString(36)
        nock('https://maps.googleapis.com').get(/.*/).query(true).reply(200, geocodeResponses.nonspecificResponse)
        nock('https://gateway.watsonplatform.net').post(/.*/).query(true).reply(200, watsonResponses.greeting)
        request.post('/ajax')
        .set('X-Forwarded-For', '10.0.0.1')
        .send({Body: input})
        .end((err, res) => {
            if (err) done(err)
            try{
                let watcher = fs.watch(publicDB, (eventType, filename) => {
                    let public_log = JSON.parse(fs.readFileSync(publicDB)).requests
                    let last_entry = public_log[public_log.length-1]
                    assert.equal(last_entry.input,input)
                    assert.strictEqual(last_entry.ip,undefined)
                    watcher.close()
                    done()
                })
            } catch(e) {
                assert.fail("couldn't find private db")
                done(e)
            }
        })
    })

})
