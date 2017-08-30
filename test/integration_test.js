'use strict';

process.env.FB_APP_SECRET = 'secret' // note: this must be set before requiring app code

const supertest        = require('supertest')
    , assert           = require('assert')
    , sinon            = require('sinon')
    , nock             = require('nock')
    , app              = require('../app')
    , config           = require('../lib/config')
    , { URL }          = require('url')
    , muniURL          = new URL(config.MUNI_URL)
    , http             = require('http')
    , logger           = require('../lib/logger')
    , exceptions       = require('../gtfs/geojson/exceptions.json')
    , moment           = require('moment-timezone')
    , muniResponses    = require('./fixtures/muniResponse')
    , geocodeResponses = require('./fixtures/googleMapsResponses')
    , watsonResponses  = require('./fixtures/watson_context')
    , facebookMessage  = require('./fixtures/facebook_message')
    , onFinished       = require('on-finished')
    , hashwords        = require('hashwords')()
    , crypto           = require('crypto');



let request = supertest(app)
app.enable('view cache')


describe("Routes", function(){
    before(() => {
        logger.transports['Google-Analytics'].silent = true // Don't send tests to GA
        logger.transports['console.info'].silent = true
    })
    after(() => {
        logger.transports['Google-Analytics'].silent = false
        logger.transports['console.info'].silent = false
    })
    describe("GET '/'", function(){
        it('Should server the home page', function(done){
            request.get('/')
            .expect(200)
            .expect(/<!DOCTYPE/)
            .expect(/When’s the/)
            .end((err, res) => done(err))
        })
        it('Should redirect to https', function(done){
            request.get('/')
            .set('X-Forwarded-Proto', 'http')
            .expect(302)
            .expect('location', /https:/)
            .end((err, res) => done(err))
        })
        it('Should return 404 page when route is not found', function(done){
            request.get('/no_routes_here')
            .expect(404)
            .expect(/<!DOCTYPE/)
            .expect(/Not Found/)
            .end((err, res) => done(err))
        })
    })
    describe("POST '/'", function(){
        it('Should save feedback from SMS', function(done){
            const feedback = "test Feedback - " + Date.now().toString(36)
                , from =  Date.now().toString(8).slice(3)

            request.post('/')
            .send({Body: 'Feedback:' + feedback, From:from})
            .expect(/^Thanks for the feedback/)
            .expect(res => {
                let comments = JSON.parse(fs.readFileSync('./comments.json'))
                  , last_comment = comments.comments[comments.comments.length-1]

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
                , clock = sinon.useFakeTimers(moment.tz(anException.date, 'YYYYMMDD', config.TIMEZONE).valueOf())

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

        it('Should add link to smart phone app', function(done){
            request.post('/')
            .send({Body: 'About'})
            .expect(/bit\.ly\/AncBus/)
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

            nock('https://maps.googleapis.com').get('/maps/api/geocode/json')
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

        it('Should Ask Watson when then geocoder fails to find an address', function(done){
            const query = "How does this work?"

            nock('https://maps.googleapis.com').get(/./).query(true)
            .reply(200, geocodeResponses.nonspecificResponse)

            nock('https://gateway.watsonplatform.net')
            .post(/\/conversation\/api\/v1\/workspaces/)
            .query({ version:'2017-05-26' })
            .reply(200, watsonResponses.greeting)

            request.post('/')
            .send({Body: query})
            .expect(/^Greetings/)
            .end((err, res) => done(err))
        })
        it('Should pass message to user when muni site is down', function(done){
            const stop_number = "2051"
            nock(muniURL.origin).get(muniURL.pathname).query({stopid: 1477}).reply(404 )

            request.post('/')
            .send({Body: stop_number})
            .expect(/Bustracker is down/)
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
                , clock = sinon.useFakeTimers(moment.tz(anException.date, 'YYYYMMDD', config.TIMEZONE).valueOf())

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

            nock('https://maps.googleapis.com').get('/maps/api/geocode/json')
            .query({
                address: address,
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

            nock('https://maps.googleapis.com').get(/./).query(true)
            .reply(200, geocodeResponses.nonspecificResponse)

            nock('https://gateway.watsonplatform.net')
            .post(/\/conversation\/api\/v1\/workspaces/)
            .query({version:'2017-05-26'})
            .reply(200, watsonResponses.greeting)

            request.post('/ajax')
            .send({Body: query})
            .expect(/<div.*Greetings/)
            .end((err, res) => done(err))
        })

        it('Should report error when muni site is down', function(done){
            const stop_number = "2051"
            nock(muniURL.origin).get(muniURL.pathname).query({stopid: "1477"}).reply(404)

            request.post('/ajax')
            .send({Body: stop_number})
            .expect(/<div.*Bustracker is down/)
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
                , clock = sinon.useFakeTimers(moment.tz(anException.date, 'YYYYMMDD', config.TIMEZONE).valueOf())

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
            const address = '5th and G street'

            nock('https://maps.googleapis.com').get('/maps/api/geocode/json')
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
            nock('https://maps.googleapis.com').get(/./).query(true).reply(200, geocodeResponses.nonspecificResponse)
            nock('https://gateway.watsonplatform.net').post(/./).query(true).reply(200, watsonResponses.greeting)

            request.get("/find/What's%20up")
            .expect(/^<!DOCTYPE/)
            .expect(/Greetings./)
            .end((err, res) =>  done(err))
        })
    })

    describe("GET /byLatLon", function() {

        it('Should check service exceptions', function(done){
            const anException = exceptions.exceptions.find(ex => ex.exception_type == 2)
                , clock = sinon.useFakeTimers(moment.tz(anException.date, 'YYYYMMDD', config.TIMEZONE).valueOf())

            request.get('/byLatLon')
            .query({lat: '61.217571', lon:'-149.895208'})
            .expect(/^Holiday/)
            .end((err, res) =>  (clock.restore(), done(err)))
        })

        it('Should return routes near location', function(done){
            request.get('/byLatLon')
            .query({lat: '61.217571', lon:'-149.895208'})
            .expect(/<div.*5TH AVENUE & F STREET WNW/)
            .end((err, res) =>   done(err))
        })

        it('Should not return routes for distant location', function(done){
            request.get('/byLatLon')
            .query({lat: '52.520007', lon: '13.404954'})
            .expect(/No stops found/)
            .end((err, res) =>  done(err))
        })

        it('Should return a message when location is not available', function(done){
            request.get('/byLatLon')
            .expect(/Can't determine your location/)
            .end((err, res) =>  done(err))
        })
    })

    describe("GET /fbhook", function(){
        const challenge ="SomeRandomToken"

        it("Should respond with the challenge string to facebook verification when token is correct", function(done){
            request.get('/fbhook')
            .query({ 'hub.mode': 'subscribe' })
            .query({'hub.challenge': challenge})
            .query({'hub.verify_token': config.FB_VALIDATION_TOKEN})
            .expect(200)
            .expect(challenge)
            .end((err, res) => done(err))
        })

        it("Should respond with 403 to facebook verification when the token is incorrect", function(done){
            request.get('/fbhook')
            .query({ 'hub.mode': 'subscribe' })
            .query({'hub.challenge': challenge})
            .query({'hub.verify_token': "wrong_token"})
            .expect(403)
            .end((err, res) => done(err))
        })
    })

    describe("POST /fbhook", function(){

        const verifyBuf = new Buffer(JSON.stringify(facebookMessage.multiple), "utf-8");
        const verifyHash = crypto.createHmac('sha1', config.FB_APP_SECRET)
            .update(verifyBuf)
            .digest('hex');

        it("Should accept multiple requests and respond to each individually", function(done){
            nock('http://bustracker.muni.org').get(muniURL.pathname).query(true).times(4).reply(200, muniResponses.goodResponse )

            let nocks = []
            facebookMessage.multiple.entry.forEach(entry =>  entry.messaging.forEach(message => {
                nocks.push(
                    nock('https://graph.facebook.com').post('/v2.6/me/messages', function(body){
                        return  body.recipient.id == message.sender.id
                                &&  body.message.text.includes('Stop ' + message.message.text )
                         })
                         .query(true).reply(200)
            )}))

            request.post('/fbhook')
            .set('x-hub-signature', 'sha1='+verifyHash)
            .send(facebookMessage.multiple)
            .expect(200)
            .end((err, res) => {
                if (err) return done(err)
                nocks.forEach(anock => anock.done())
                done()
            })
        })

        it("Should pass error messages on to user", function(done){
            nock('http://bustracker.muni.org').get(muniURL.pathname).times(4).query(true).reply(404)

            let nocks = []
            facebookMessage.multiple.entry.forEach(entry =>  entry.messaging.forEach(message => {
                nocks.push(
                    nock('https://graph.facebook.com').post('/v2.6/me/messages', function(body){
                        return  body.recipient.id == message.sender.id
                                &&  body.message.text.includes('Bustracker is down' )
                        })
                        .query(true).reply(200)
            )}))

            request.post('/fbhook')
            .set('x-hub-signature', 'sha1='+verifyHash)
            .send(facebookMessage.multiple)
            .expect(200)
            .end((err, res) => {
                if (err) return done(err)
                nocks.forEach(anock => anock.done())
                done()
            })
        })
    })

    describe("POST /feedback", function(){
        it('Should save feedback from web', function(done){
            const feedback = "test Feedback - " + Date.now().toString(36)
                , email =  "test@" + Date.now().toString(36) + ".com"

            request.post('/feedback')
            .send({comment: feedback, email:email})
            .expect(/<div.*Thanks for the feedback/)
            .expect(res => {
                const comments = JSON.parse(fs.readFileSync('./comments.json'))
                const last_comment = comments.comments[comments.comments.length-1]
                assert.equal(last_comment.feedback, feedback)
                assert.equal(last_comment.email, email)
            })
            .end((err, res) => done(err))
        })
    })

    describe("GET /respond", function(){
        it('Should provide form to respond to feeback given message hash', function(done){
            const comments = JSON.parse(fs.readFileSync('./comments.json'))
            const last_comment = comments.comments.find(com => com.phone && com.response_hash)
            request.get('/respond')
            .query({hash: last_comment.response_hash})
            .expect(/<!DOCTYPE/)
            .expect(new RegExp('From phone: ' + last_comment.phone ))
            .expect(new RegExp('<input type="hidden" name="hash" value="' + last_comment.response_hash))
            .end((err, res) => done(err))
        })
        it('Should return not found when comment is not found', function(done){
            request.get('/respond')
            .query({hash: 'foobar'})
            .expect(/Not Found/)
            .end((err, res) => done(err))
        })
    })
    describe("GET /logplot", function(){
        it('Should render the graph page', function(done){
            request.get('/logplot')
            .expect(/<!DOCTYPE/)
            .expect(/Logs/)
            .end((err, res) => done(err))
        })
    })
})

describe("Logging hits", function(){
    const publicDB = './public/db.json'
        , privateDB = './db_private.json'

    before(() => logger.transports['console.info'].silent = true)
    after(() => logger.transports['console.info'].silent = false)

    it('Should log SMS requests to private db', function(done){
        const from = "testPhone: " + Date.now().toString(8).slice(3)
        const stop = "1066"
        nock(muniURL.origin).get(muniURL.pathname).query({stopid: "2124"}).reply(200, muniResponses.goodResponse )

        request.post('/')
        .send({Body: stop, From: from})
        .end((err, res) => {
            if (err) done(err)
            logger.once('logging', (res) => {
                if (res.name == 'File-Logs') {
                    try {
                        const private_log = JSON.parse(fs.readFileSync(privateDB)).requests
                        const last_entry = private_log[private_log.length-1]
                        assert.equal(last_entry.phone, from)
                        done()
                    } catch(e){ done(e) }
                }
            })
        })
    })

    it('Should log SMS requests to public db', function(done){
        const from = "testPhone: " + Date.now().toString(8).slice(3)
        const stop = "2051"

        nock(muniURL.origin).get(muniURL.pathname).query({stopid: "1477"}).reply(200, muniResponses.goodResponse )

        request.post('/')
        .send({Body: stop, From: from})
        .end((err, res) => {
            if (err) done(err)
            logger.once('logging', (res) => {
                if (res.name == 'File-Logs') {
                    try{
                        const private_log = JSON.parse(fs.readFileSync(publicDB)).requests
                        const last_entry = private_log[private_log.length-1]

                        assert.equal(last_entry.phone, hashwords.hashStr(from))
                        done()
                    } catch(e){ done(e) }
                }
            })

        })
    })

    it('Should log web requests to private db', function(done){
        const input = "Test query" + Date.now().toString(36)
        const ip = [0,0,0].reduce((acc, cur) => acc + "." + Math.floor(Math.random() * (256)), "10")

        nock('http://bustracker.muni.org').get(muniURL.pathname).query(true).reply(200, muniResponses.goodResponse )
        nock('https://maps.googleapis.com').get(/./).query(true).reply(200, geocodeResponses.nonspecificResponse)
        nock('https://gateway.watsonplatform.net').post(/./).query(true).reply(200, watsonResponses.greeting)

        request.post('/')
        .set('X-Forwarded-For', ip)
        .send({Body: input})
        .end((err, res) => {
            if (err) done(err)
            logger.once('logging', (res) => {
                if (res.name == 'File-Logs') {
                    try{
                        const private_log = JSON.parse(fs.readFileSync(privateDB)).requests
                        const last_entry = private_log[private_log.length-1]

                        assert.equal(last_entry.input,input)
                        assert.equal(last_entry.ip,ip)
                        done()
                    } catch(e){ done(e) }
                }
            })
        })
    })

    it('Should log web requests to public db (without ip)', function(done){
        const from = "testPhone: " + Date.now().toString(8).slice(3)
            , input = "Test query" + Date.now().toString(36)

        nock('https://maps.googleapis.com').get(/./).query(true).reply(200, geocodeResponses.nonspecificResponse)
        nock('https://gateway.watsonplatform.net').post(/./).query(true).reply(200, watsonResponses.greeting)

        request.post('/ajax')
        .set('X-Forwarded-For', '10.0.0.1')
        .send({Body: input})
        .end((err, res) => {
            if (err) done(err)
            logger.once('logging', (res) => {
                if (res.name == 'File-Logs') {
                    try{
                        const public_log = JSON.parse(fs.readFileSync(publicDB)).requests
                        const last_entry = public_log[public_log.length-1]

                        assert.equal(last_entry.input,input)
                        assert.strictEqual(last_entry.ip,undefined)
                        done()
                    } catch(e){ done(e) }
                }
            })
        })
    })

    it('Should log facebook requests to public db (with hashed user)', function(done){
        nock('https://graph.facebook.com').post('/v2.6/me/messages', /./).query(true).reply(200)

        let fbRequest = facebookMessage.single_about()
          , fbuser = "Test_fbuser_public" + Date.now().toString(36)
          , input = "about"

        fbRequest.entry[0].messaging[0].sender.id = fbuser
        fbRequest.entry[0].messaging[0].message.text = input

        const verifyBuf = new Buffer(JSON.stringify(fbRequest), "utf-8");
        const verifyHash = crypto.createHmac('sha1', config.FB_APP_SECRET)
            .update(verifyBuf)
            .digest('hex');

        request.post('/fbhook')
        .set('x-hub-signature', 'sha1='+verifyHash )
        .send(fbRequest)
        .end((err, res) => {
            if (err) done("error here", err)
            logger.once('logging', (res) => {
                if (res.name == 'File-Logs') {
                    try{
                        const public_log = JSON.parse(fs.readFileSync(publicDB)).requests
                        const last_entry = public_log[public_log.length-1]

                        assert.equal(last_entry.input, input)
                        assert.equal(hashwords.hashStr(fbuser), last_entry.fbUser)
                        done()
                    } catch(e){ done(e) }
                }
            })
        })
    })

    it('Should log facebook requests to private db', function(done){
        nock('https://graph.facebook.com').post('/v2.6/me/messages', /./).query(true).reply(200)

        let fbRequest = facebookMessage.single_about()
          , fbuser = "Test_fbuser_private " + Date.now().toString(36)
          , input = "about"

        fbRequest.entry[0].messaging[0].sender.id = fbuser
        fbRequest.entry[0].messaging[0].message.text = input

        const verifyBuf = new Buffer(JSON.stringify(fbRequest), "utf-8");
        const verifyHash = crypto.createHmac('sha1', config.FB_APP_SECRET)
            .update(verifyBuf)
            .digest('hex');

        request.post('/fbhook')
        .set('x-hub-signature', 'sha1='+verifyHash )
        .send(fbRequest)
        .end((err, res) => {
            if (err) done(err)
            logger.once('logging', (res) => {
                if (res.name == 'File-Logs') {
                    try{
                        const private_log = JSON.parse(fs.readFileSync(privateDB)).requests
                        const last_entry = private_log[private_log.length-1]

                        assert.equal(last_entry.input,input)
                        assert.equal(fbuser, last_entry.fbUser)
                        done()
                    } catch(e){ done(e) }
                }
            })

        })
    })
    it("Should call Google Analytics when requests are made", function(done){
        const ns = nock("http://www.google-analytics.com").post('/collect', /ea=About/).query(true).reply(200)
        request.post('/')
        .send({Body: "about"})
        .end((err, res) => {
            if (err) done(err)
                ns.done()
                done()
        })
    })
})

