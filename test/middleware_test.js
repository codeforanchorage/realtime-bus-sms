'use strict';

const httpMocks = require('node-mocks-http'),
      express = require('express'),
      assert = require('assert'),
      sinon = require('sinon'),
      lib = require('../lib/bustracker'),
      geocode = require('../lib/geocode'),
      logger = require('../lib/logger'),
      config = require('../lib/config'),
      watson = require('watson-developer-cloud'),
      request = require('request')

const mw = require('../routes/middleware'),
      fakedata = require('./fixtures/stopdata')

describe('Middleware Function', function(){
    describe('sanitizeInput', function(){
        let next = sinon.stub()
        let res = {}
        it('Should remove all lines except the first', function(){
            let req = {body: {Body:"Line One\nLine Two\nLine Three"} }
            mw.sanitizeInput(req, res, next)
            assert.equal(req.body.Body, "Line One")
        })
        it('Should ensure req.body.Body is a string', function(){
            let int = 123
            let req = {body: {Body:int} }
            mw.sanitizeInput(req, res, next)
            assert.equal(req.body.Body, String(int))
        })
        it('Should replace tabs with a single space', function(){
            let req = {body: {Body:"One\tTwo\t\t\tThree"} }
            mw.sanitizeInput(req, res, next)
            assert.equal(req.body.Body, "One Two Three")
        })
        it('Should remove emojis', function(){
            let req = {body: {Body:"5th and G 💋Street👍"} }
            mw.sanitizeInput(req, res, next)
            assert.equal(req.body.Body, "5th and G Street")
        })
        it('Should not change normal input', function(){
            let req = {body: {Body:"1066"} }
            mw.sanitizeInput(req, res, next)
            assert.equal(req.body.Body, "1066")
        })
        it('Should call next() when finished', function(){
            let req = {body: {Body:"1066"} }
            mw.sanitizeInput(req, res, next)
            sinon.assert.called(next)
        })
    })
    describe('Check Service Exceptions', function(){
        let libStub, res, next
        beforeEach(function(){
            libStub = sinon.stub(lib, 'serviceExceptions')
            res = {render: sinon.stub(), locals: {}}
            next = sinon.stub()
        })
        afterEach(function(){
            libStub.restore()
        })
        it('Should only call call next() when not a holiday', function(){
            libStub.returns(false)
            mw.checkServiceExceptions({}, res, next)
            sinon.assert.notCalled(res.render)
            sinon.assert.called(next)
        })
        it('Should render a message on holidays', function(){
            libStub.returns(true)
            mw.checkServiceExceptions({}, res, next)
            sinon.assert.called(res.render)
            sinon.assert.notCalled(next)
        })
        it('Should set res.locals on holidays', function(){
            libStub.returns(true)
            mw.checkServiceExceptions({}, res, next)
            assert.deepEqual(res.locals.message, {name: "Holiday", message:'There is no bus service today.'})
        })
    })
    describe('Blank input responder', function(){
        let next, res
        beforeEach(function(){
            res = {render: sinon.stub(), locals: {}}
            next = sinon.stub()
        })
        it("Should set res.locals.action with empty input and call render", function(){
            let req = {body: {Body:""} }
            mw.blankInputRepsonder(req, res, next)
            assert.equal(res.locals.action, 'Empty Input')
            sinon.assert.called(res.render)
            sinon.assert.notCalled(next)
        })
        it("Should set res.locals.action with whitespace input and call render", function(){
            let req = {body: {Body:"   "} }
            mw.blankInputRepsonder(req, res, next)
            assert.equal(res.locals.action, 'Empty Input')
            res.locals.action = ""

            req = {body: {Body:"\t\n   \r\n"} }
            mw.blankInputRepsonder(req, res, next)
            assert.equal(res.locals.action, 'Empty Input')
        })
        it("Should set res.locals.message and render message tempalte", function(){
            let req = {body: {Body:""} }
            mw.blankInputRepsonder(req, res, next)
            assert.deepEqual(res.locals.message, {name: "No input!", message:'Please send a stop number, intersection, or street address to get bus times.'})
            sinon.assert.calledWith(res.render)
        })
        it('Should call next() when input is not blank', function(){
            let req = {body: {Body:"1066"} }
            mw.blankInputRepsonder(req, res, next)
            sinon.assert.notCalled(res.render)
            sinon.assert.called(next)
        })
    })
    describe('About responder', function(){
        let next, res
        beforeEach(function(){
            res = {render: sinon.stub(), locals: {}}
            next = sinon.stub()
        })
        it("Should not repsond to normal requests", function(){
            let req = {body: {Body:"1066"} }
            mw.aboutResponder(req, res, next)
            req = {body: {Body:"5th and G street"} }
            mw.aboutResponder(req, res, next)
            req = {body: {Body:"How about some pizza"} }
            mw.aboutResponder(req, res, next)

            sinon.assert.calledThrice(next)
            sinon.assert.notCalled(res.render)
        })
        it("Should respond to About and send proper template", function(){
            let req = {body: {Body:"About"} }
            mw.aboutResponder(req, res, next)

            sinon.assert.notCalled(next)
            sinon.assert.calledWith(res.render, 'about-partial')
            assert.equal(res.locals.action, "About")
        })
        it("Should be case insensitive", function(){
            let req = {body: {Body:"abOUt"} }
            mw.aboutResponder(req, res, next)

            sinon.assert.notCalled(next)
            sinon.assert.calledWith(res.render, 'about-partial')
            assert.equal(res.locals.action,  "About")
        })
        it("Should work with whitespace padding", function(){
            let req = {body: {Body:"  about  "} }
            mw.aboutResponder(req, res, next)

            sinon.assert.notCalled(next)
            sinon.assert.calledWith(res.render, 'about-partial')
            assert.equal(res.locals.action, "About")
        })
    })
    describe('stopNumberResponder', function(){
        let next, res, getStopsStub
        describe('With expected return values', function(){
            beforeEach(function(){
                res = {render: sinon.stub(), locals: {}}
                getStopsStub = sinon.stub(lib, 'getStopFromStopNumber').resolves(fakedata.stoptimes)
                next = () => assert.fail("Next() called", "stopNumberResponder should have handled this case", undefined, 'when')
            })
            afterEach(function(){
                getStopsStub.restore()
            })
            it('Should coerce input to an int and pass it to bustracker function', function(){
                let input = "1066"
                let req = {body: {Body:input} }
                mw.stopNumberResponder(req, res, next)
                sinon.assert.calledWith(getStopsStub, parseInt(input, 10))
            })
            it('Should not respond to non-numeric requests', function(){
                next = sinon.stub()
                let req = {body: {Body:"5th and G Street"} }
                mw.stopNumberResponder(req, res, next)
                sinon.assert.called(next)
                sinon.assert.notCalled(getStopsStub)
            })
            it('Should set res.locals.routes to the routes object', function(){
                let req = {body: {Body:"1066"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => {
                    assert.strictEqual(res.locals.routes, fakedata.stoptimes)
                })
            })
            it('Should set res.locals.action to "Stop Lookup"', function(){
                let req = {body: {Body:"99"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() =>  assert.equal(res.locals.action,  "Stop Lookup"))
            })
            it('Should respond to "stop"+number', function(){
                let req = {body: {Body:"stop 1066"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => sinon.assert.called(res.render))
            })
            it('Should respond to "#"+number', function(){
                let req = {body: {Body:"# 1066"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => sinon.assert.called(res.render))
            })
            it('Should be case insensitive', function(){
                let req = {body: {Body:"sTOp 1066"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => sinon.assert.called(res.render))
            })
            it('Should ignore white space', function(){
                let req = {body: {Body:" 1066   \n"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => sinon.assert.called(res.render))
            })
            it('Should respond with the correct template', function(){
                let req = {body: {Body:"1066"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => sinon.assert.calledWith(res.render, ('stop-list')))
            })
        })
        describe('With bad requests', function(){
            let error = new Error("Test Error")
            beforeEach(function(){
                res = {render: sinon.stub(), locals: {}}
                next = () => assert.fail("Next() called", "Middleware should have handled this case", undefined, 'when')
                getStopsStub = sinon.stub(lib, 'getStopFromStopNumber').rejects(error)
            })
            afterEach(function(){
                getStopsStub.restore()
            })
            it('Should render the returned error message when no stops are found', function(){
                let req = {body: {Body:"0"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => sinon.assert.calledWith(res.render, 'message', {message: error}))
            })
            it('Should set res.local.action to "Failed Stop Lookup"', function(){
                let req = {body: {Body:"0"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => assert.equal(res.locals.action, 'Failed Stop Lookup' ))
            })

        })
    })
    describe('addressResponder', function(){
        let next, res, getStopsStub
        beforeEach(function(){
            res = {render: sinon.stub(), locals: {}}
            getStopsStub = sinon.stub(geocode, 'stops_near_location')
            next = () => assert.fail("Next() called", "addressResponder should have handled this case", undefined, 'when')
        })
        afterEach(function(){
            getStopsStub.restore()
        })
        it('Should pass input directly to geocoder', function(){
            let input = "5th and G Street"
            getStopsStub.resolves(fakedata.stops_from_location)
            let req = {body: {Body:input} }
            return mw.addressResponder(req, res, next)
            .then(() =>  sinon.assert.calledWith(getStopsStub, input))
        })
        it('Should set res.locals.routes to the object returned from the geocoder', function(){
            getStopsStub.resolves(fakedata.stops_from_location)
            let req = {body: {Body:"5th and G Street"} }
            return mw.addressResponder(req, res, next)
            .then(() =>  assert.strictEqual(fakedata.stops_from_location, res.locals.routes))
        })
        it('Should render the "route-list" template', function(){
            getStopsStub.resolves(fakedata.stops_from_location)
            let req = {body: {Body:"5th and G Street"} }
            return mw.addressResponder(req, res, next)
            .then(() => sinon.assert.calledWith(res.render, 'route-list'))
        })
        it('Should send a "No Stops" message when no stops are found near location', function(){
            getStopsStub.resolves(fakedata.no_stops_near_location)
            let req = {body: {Body:"1800 Citation Road"} }
            return mw.addressResponder(req, res, next)
            .then(() => {
                assert(res.locals.message.message.includes(`${config.NEAREST_BUFFER} mile`))
                assert.equal(res.locals.message.name, "No Stops")
                sinon.assert.calledWith(res.render, 'message')
            })
        })
        it('Should call next() when the address is not found', function(){
            next = sinon.stub()
            let req = {body: {Body:"1800 Citation Road"} }
            let error = new Error()
            error.type = 'NOT_FOUND'
            getStopsStub.rejects(error)
            return mw.addressResponder(req, res, next)
            .then(() => sinon.assert.called(next))
        })
        it('Should render message for other errors', function(){
            let req = {body: {Body:"1800 Citation Road"} }
            let err = new Error("some other error")
            getStopsStub.rejects(err)
            return mw.addressResponder(req, res, next)
            .then(() => sinon.assert.calledWith(res.render, 'message', {message: err}))
        })
        it('Should set action to "Failed Address Lookup when address is not be found', function(){
            let req = {body: {Body:"1800 Citation Road"} }
            let err = new Error("some other error")
            getStopsStub.rejects(err)
            return mw.addressResponder(req, res, next)
            .then(() => assert.equal(res.locals.action, 'Failed Address Lookup'))
        })
    })
    describe('findLatLon', function(){
        let next, res, getStopsStub, findStub
        beforeEach(function(){
            res = {render: sinon.stub(), locals: {}}
            findStub = sinon.stub(geocode, 'findNearestStops')
            next = () => assert.fail("Next() called", "findLatLon should have handled this case", undefined, 'when')
        })
        afterEach(function(){
            findStub.restore()
        })
        it('Should call library function with provided lat/lon', function(){
            let [lat, lon] = ['61.2181', '149.9']
            let req = {query: {lat: lat, lon: lon} }
            mw.findbyLatLon(req, res, next)
            sinon.assert.calledWith(findStub, lat, lon)
        })
        it('Should return a message when location undetermined', function(){
            let req = {query: {lat: undefined, lon: undefined} }
            mw.findbyLatLon(req, res, next)
            sinon.assert.calledWith(res.render, 'message', {message: {message: "Can't determine your location"}})
        })
        it('Should return a message when location is found, but there are no stops nearby', function(){
            let [lat, lon] = ['61.2181', '149.9']
            let req = {query: {lat: lat, lon: lon} }
            findStub.returns([])
            mw.findbyLatLon(req, res, next)
            sinon.assert.calledWith(res.render, 'message', {message: {message: "No stops found near you"}})
        })
        it('Should render "route-list-partial" template when stops are found', function(){
            let [lat, lon] = ['61.2181', '149.9']
            let req = {query: {lat: lat, lon: lon} }
            findStub.returns(fakedata.stops_by_lat_lon)
            mw.findbyLatLon(req, res, next)
            sinon.assert.calledWith(res.render, 'route-list-partial')
        })
        it('Should pass stops to template', function(){
            let [lat, lon] = ['61.2181', '149.9']
            let req = {query: {lat: lat, lon: lon} }
            findStub.returns(fakedata.stops_by_lat_lon)
            mw.findbyLatLon(req, res, next)
            assert.deepEqual(res.render.args[0][1].routes.data.stops, fakedata.stops_by_lat_lon)
        })
    })

    describe("askWatson", function(){
        let watsonStub, messageStub, next, res, req, loggerStub, watson_response
        beforeEach(function(){
            watson_response = require('./fixtures/watson_context')
            next = sinon.stub()
            messageStub = sinon.stub()
            watsonStub = sinon.stub(watson, 'conversation').returns({message: messageStub})
            loggerStub =  sinon.stub(logger, 'error')
            res = {render: sinon.stub(), locals: {}, cookie: sinon.stub()}
            req = {body: {Body: "A Question"}, cookies:{context: '{"this": ["is", "an", "object"]}'}}

        })
        afterEach(function(){
            watsonStub.restore()
            loggerStub.restore()
        })
        it("Should call the Watson Init Function with correct versions, date, and auth info", function(){
            mw.askWatson(req, res, next)
            sinon.assert.calledWith(watsonStub, sinon.match({version: 'v1'}))
            sinon.assert.calledWith(watsonStub, sinon.match({version_date: '2017-05-26'}))
            sinon.assert.calledWith(watsonStub, sinon.match.has('username'))
            sinon.assert.calledWith(watsonStub, sinon.match.has('password'))
        })
        it("Should log an error when Watson init fails", function(){
            let error = new Error("Watson Error")
            watsonStub.throws(error)
            mw.askWatson(req, res, next)
            sinon.assert.calledWith(loggerStub, error)
        })
        it("Should return a not found message to the user when Watson init fails", function(){
            let error = new Error("Watson Error")
            watsonStub.throws(error)
            mw.askWatson(req, res, next)
            assert.deepEqual(res.locals.message, {message: `A search for ${req.body.Body} found no results. For information about using this service send "About".`} )
            sinon.assert.calledWith(res.render, "message")
        })
        it("Should call waston message with workspace, user input, and contex", function(){
            let context = JSON.parse(req.cookies['context'])
            mw.askWatson(req, res, next)
            sinon.assert.calledWith(messageStub, sinon.match.has('workspace_id'))
            sinon.assert.calledWith(messageStub, sinon.match.has('input',  sinon.match({'text': req.body.Body})))
            sinon.assert.calledWith(messageStub, sinon.match.has('context', sinon.match(context)))
        })
        it("Should log an error if the message fails", function(){
            let error = new Error("Watson Error")
            messageStub.yields(error)
            mw.askWatson(req, res, next)
            sinon.assert.calledWith(loggerStub, error, {input: req.body.Body} )
        })
        it("Should send a no-results message to their user if the message fails", function(){
            let error = new Error("Watson Error")
            messageStub.yields(error)
            mw.askWatson(req, res, next)
            assert.deepEqual(res.locals.message, {message: `A search for ${req.body.Body} found no results. For information about using this service send "About".`})
            sinon.assert.calledWith(res.render, 'message' )
        })
        it("Should set cookie to the response context ", function(){
            // let watson_response = {context: watson_context.stop_lookup }
            messageStub.yields(null, watson_response.stop_lookup)
            mw.askWatson(req, res, next)
            sinon.assert.calledWith(res.cookie, 'context', JSON.stringify(watson_response.stop_lookup.context))
        })
        it("Should set res.locals.action to 'Stop Lookup' when watson returns stop lookup intent", function(){
            messageStub.yields(null, watson_response.stop_lookup)
            mw.askWatson(req, res, next)
            assert.equal(res.locals.action, 'Stop Lookup')
        })
        it("Should render stop-list with stops when watson returns a stop", function(done){
            let fake_stop_list = {stop_list: [1, 2, 3]}
            let stop_lookup = sinon.stub(lib, 'getStopFromStopNumber')
            stop_lookup.resolves(fake_stop_list)
            messageStub.yields(null, watson_response.stop_lookup)

            res.render = (arg) => {
                try{
                    assert.deepEqual(res.locals.routes, fake_stop_list)
                    assert.equal(arg, 'stop-list')
                    done()
                } catch(e) { done(e) }
            }
            mw.askWatson(req, res, next)
            stop_lookup.restore()
        })
        it("Should render an error and set res.locals.action when stop lookup failis", function(done){
            let error = new Error("Some stop error")
            let stop_lookup = sinon.stub(lib, 'getStopFromStopNumber')
            stop_lookup.rejects(error)
            messageStub.yields(null, watson_response.stop_lookup)
            res.render = (template, obj) => {
                try{
                    assert.equal(res.locals.action, 'Failed Stop Lookup')
                    assert.equal(template, 'message')
                    assert.deepEqual(obj, {message: error})
                    done()
                } catch(e) { done(e) }
            }
            mw.askWatson(req, res, next)
            stop_lookup.restore()
        })
        it("Should render (and log) an error if watson returns a stop lookup intent with no stop", function(){
            let stop_lookup = sinon.stub(lib, 'getStopFromStopNumber')
            messageStub.yields(null, watson_response.stop_lookup_no_stop)
            mw.askWatson(req, res, next)
            assert.equal(res.locals.action, 'Watson Error')
            sinon.assert.called(loggerStub)
            assert.deepEqual(res.locals.message, {name: "Bustracker Error", message:"I'm sorry an error occured." })
            sinon.assert.calledWith(res.render, 'message')
            stop_lookup.restore()
        })
        it("Should render a failed Address lookup message when watson returns an Address Lookup intent", function(){
            messageStub.yields(null, watson_response.address_lookup)
            mw.askWatson(req, res, next)
            assert.equal( res.locals.action, 'Failed Address Lookup')
            assert.deepEqual(res.locals.message, {message:watson_response.address_lookup.output.text.join(' ')})
            sinon.assert.calledWith(res.render, 'message')
        })
        it("Should render watson's message and set res.local.action to 'Failed Address Lookup' when watson returns an Address Lookup intent", function(){
            messageStub.yields(null, watson_response.address_lookup)
            mw.askWatson(req, res, next)
            assert.equal( res.locals.action, 'Failed Address Lookup')
            assert.deepEqual(res.locals.message, {message:watson_response.address_lookup.output.text.join(' ')})
            sinon.assert.calledWith(res.render, 'message')
        })
        it("Should set res.locals.action to 'Watson Chat' and render message for all other intents", function(){
            messageStub.yields(null, watson_response.greeting)
            mw.askWatson(req, res, next)
            assert.equal( res.locals.action, 'Watson Chat')
            assert.deepEqual(res.locals.message, {message:watson_response.greeting.output.text.join(' ')})
            sinon.assert.calledWith(res.render, 'message')
        })
        it("Should set res.locals.action to 'Watson Chat' and render message when there is no intent", function(){
            messageStub.yields(null, watson_response.no_intent)
            mw.askWatson(req, res, next)
            assert.equal( res.locals.action, 'Watson Chat')
            assert.deepEqual(res.locals.message, {message:watson_response.no_intent.output.text.join(' ')})
            sinon.assert.calledWith(res.render, 'message')
        })
        it("Should render and log an error message if there is no context in the response ", function(){
            let badResponse = {huh: "wtf?"}
            messageStub.yields(null, badResponse)
            mw.askWatson(req, res, next)
            sinon.assert.calledWith(loggerStub, sinon.match.string, sinon.match({response: badResponse}))
            sinon.assert.calledWith(res.render, 'message')
        })
    })
    describe("Facebook Functions", function(){
        describe("facebook_verify", function(){
            const fbToken = "someRandomFBToken",
                    fbChallenge = "aFBChallengeString",
                    sendStub = sinon.stub(),
                    statusStub = sinon.stub().returns({send:sendStub}),
                    res = {sendStatus: sinon.stub(), status: statusStub},
                    originalToken = config.FB_VALIDATION_TOKEN
            let fbRequest, req, logStub
            beforeEach(function(){
                config.FB_VALIDATION_TOKEN = fbToken
                fbRequest = {
                    'hub.mode': 'subscribe',
                    'hub.verify_token': fbToken,
                    'hub.challenge': fbChallenge
                    }
                req = {query: fbRequest}
                logger.transports['console.info'].silent = true
            })
            afterEach(function(){
                config.FB_VALIDATION_TOKEN = originalToken
                logger.transports['console.info'].silent = false
            })
            it("Should send 200 response to FB subscribe when token matches", function(){
                mw.facebook_verify(req, res)
                sinon.assert.calledWith(res.status, 200)
            })
            it("Should respond with FB challenge string", function(){
                mw.facebook_verify(req, res)
                sinon.assert.calledWith(sendStub, fbChallenge)
            })
            it("Should send a 403 status when when tokens don't match", function(){
                fbRequest['hub.verify_token'] = "noGood"
                mw.facebook_verify(req, res)
                sinon.assert.calledWith(res.sendStatus, 403)
            })
            it("Should send a 403 status for modes other than subscribe", function(){
                fbRequest['hub.mode'] = "ShowMeTheLove"
                mw.facebook_verify(req, res)
                sinon.assert.calledWith(res.sendStatus, 403)
            })
        })
        describe("facebook_update", function(){
            let req, runMWStub, res
            const fb_message = require('./fixtures/facebook_message')
            beforeEach(function(){
                runMWStub = sinon.stub()
                req = {body: fb_message.multiple, runMiddleware: runMWStub}
                res = {sendStatus: sinon.stub()}
            })
            afterEach(function(){
                runMWStub
            })

            it("Should send 403 for everything except page subscriptions", function(){
                    req = {body: {object: "something_else"}}
                    mw.facebook_update(req,res)
                    sinon.assert.calledWith(res.sendStatus, 403)
            })
            it('Should pass an object with the data from each message back through the middleware', function(){
                mw.facebook_update(req,res)
                fb_message.multiple.entry.forEach((entry, j) => entry.messaging.forEach((obj, i) => {
                    let called = {
                        method: 'post',
                        body: {
                            Body: obj.message.text,
                            From: obj.sender.id,
                            isFB: true
                        }
                    }
                    assert.deepEqual(called, runMWStub.args[j * fb_message.multiple.entry.length + i][1])
                }))
            })
            it("Should pass data from middleware to sendFBMessage", function(){
                let sendFBStub = sinon.stub(mw, 'sendFBMessage')
                let newdata = {"foo": "bar"}
                req.runMiddleware.yields({}, newdata, {headers: "headers"})
                mw.facebook_update(req,res)
                fb_message.multiple.entry.forEach((entry, j) => entry.messaging.forEach((obj, i) => {
                    let itemNum = j*fb_message.multiple.entry.length + i // unravel nested calls
                    assert.deepEqual(obj.sender.id, sendFBStub.args[itemNum][0])
                    assert.deepEqual(newdata, sendFBStub.args[itemNum][1])
                }))
                sendFBStub.restore()
            })
        })
        describe("SendFBMessage", function(){
            let requestStub, loggerStub
            const old_token = config.FB_PAGE_ACCESS_TOKEN,
                  facebook_api_uri = 'https://graph.facebook.com/v2.6/me/messages'

            beforeEach(function(){
                requestStub = sinon.stub(request, "post")
                config.FB_PAGE_ACCESS_TOKEN = "A_facebook_token"
                loggerStub = sinon.stub(logger, 'error')
            })
            afterEach(function(){
                requestStub.restore()
                config.FB_PAGE_ACCESS_TOKEN = old_token
                loggerStub.restore()
            })
            it("Should post to facebook URI with id and message", function(){
                let id = "fb_id",
                    message = "A message from our sponsors"

                mw.sendFBMessage(id, message)
                let sent = requestStub.args[0][0]
                assert.equal(sent.uri, facebook_api_uri)
                assert.deepEqual(sent.qs, {access_token: config.FB_PAGE_ACCESS_TOKEN})
                assert.equal(sent.json.recipient.id, id)
                assert.equal(sent.json.message.text, message)
            })
            it("Should log an error if facebook request fails", function(){
                let error = new Error("A Facebook Error")
                requestStub.yields(error)
                return mw.sendFBMessage('id', 'message')
                .then(() =>{ throw new Error("Promise should not be fulfilled when there is an error")},
                    () => sinon.assert.calledWith(loggerStub, "Failed calling Send API: " + error.message))
            })
            it("Should log an error if facebook response code is not 200", function(){
                let bad_response = {statusCode: 404, statusMessage: "Not Found"}
                requestStub.yields(null, bad_response)
                return mw.sendFBMessage('id', 'message')
                .then(() => {throw new Error("Promise should not be fulfilled when there is an error")},
                   ()=> sinon.assert.calledWith(loggerStub, "Failed calling Send API: " + bad_response.statusCode + " - " + bad_response.statusMessage))

            })
        })
    })
})
