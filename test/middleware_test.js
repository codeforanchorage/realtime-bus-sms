const httpMocks = require('node-mocks-http'),
      express = require('express'),
      assert = require('assert'),
      sinon = require('sinon'),
      lib = require('../lib/bustracker'),
      geocode = require('../lib/geocode'),
      logger = require('../lib/logger'),
      config = require('../lib/config'),
      watson = require('watson-developer-cloud')

const mw = require('../routes/middleware'),
      fakedata = require('./fixtures/stopdata'),
      comment_fixture = require('./fixtures/comments.json')


describe('Middleware Function', function(){
    describe('sanitizeInput', function(){
        var next = sinon.stub()
        var res = {}
        it('Should remove all lines except the first', function(){
            var req = {body: {Body:"Line One\nLine Two\nLine Three"} }
            mw.sanitizeInput(req, res, next)
            assert.equal(req.body.Body, "Line One")
        })
        it('Should replace tabs with a single space', function(){
            var req = {body: {Body:"One\tTwo\t\t\tThree"} }
            mw.sanitizeInput(req, res, next)
            assert.equal(req.body.Body, "One Two Three")
        })
        it('Should remove emojis', function(){
            var req = {body: {Body:"5th and G 💋Street👍"} }
            mw.sanitizeInput(req, res, next)
            assert.equal(req.body.Body, "5th and G Street")
        })
        it('Should not change normal input', function(){
            var req = {body: {Body:"1066"} }
            mw.sanitizeInput(req, res, next)
            assert.equal(req.body.Body, "1066")
        })
        it('Should call next() when finished', function(){
            var req = {body: {Body:"1066"} }
            mw.sanitizeInput(req, res, next)
            sinon.assert.called(next)
        })
    })
    describe('Check Service Exceptions', function(){
        var libStub, res, next
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
        var next, res
        beforeEach(function(){
            res = {render: sinon.stub(), locals: {}}
            next = sinon.stub()
        })
        it("Should set res.locals.action with empty input and call render", function(){
            var req = {body: {Body:""} }
            mw.blankInputRepsonder(req, res, next)
            assert(res.locals.action === 'Empty Input')
            sinon.assert.called(res.render)
            sinon.assert.notCalled(next)
        })
        it("Should set res.locals.action with whitespace input and call render", function(){
            var req = {body: {Body:"   "} }
            mw.blankInputRepsonder(req, res, next)
            assert.equal(res.locals.action, 'Empty Input')
            res.locals.action = ""

            var req = {body: {Body:"\t\n   \r\n"} }
            mw.blankInputRepsonder(req, res, next)
            assert.equal(res.locals.action, 'Empty Input')
        })
        it("Should set res.locals.message and render message tempalte", function(){
            var req = {body: {Body:""} }
            mw.blankInputRepsonder(req, res, next)
            assert.deepEqual(res.locals.message, {name: "No input!", message:'Please send a stop number, intersection, or street address to get bus times.'})
            sinon.assert.calledWith(res.render)
        })
        it('Should call next() when input is not blank', function(){
            var req = {body: {Body:"1066"} }
            mw.blankInputRepsonder(req, res, next)
            sinon.assert.notCalled(res.render)
            sinon.assert.called(next)
        })
    })
    describe('About responder', function(){
        var next, res
        beforeEach(function(){
            res = {render: sinon.stub(), locals: {}}
            next = sinon.stub()
        })
        it("Should not repsond to normal requests", function(){
            var req = {body: {Body:"1066"} }
            mw.aboutResponder(req, res, next)
            var req = {body: {Body:"5th and G street"} }
            mw.aboutResponder(req, res, next)
            var req = {body: {Body:"How about some pizza"} }
            mw.aboutResponder(req, res, next)

            sinon.assert.calledThrice(next)
            sinon.assert.notCalled(res.render)
        })
        it("Should respond to About and send proper template", function(){
            var req = {body: {Body:"About"} }
            mw.aboutResponder(req, res, next)

            sinon.assert.notCalled(next)
            sinon.assert.calledWith(res.render, 'about-partial')
            assert.equal(res.locals.action, "About")
        })
        it("Should be case insensitive", function(){
            var req = {body: {Body:"abOUt"} }
            mw.aboutResponder(req, res, next)

            sinon.assert.notCalled(next)
            sinon.assert.calledWith(res.render, 'about-partial')
            assert.equal(res.locals.action,  "About")
        })
        it("Should work with whitespace padding", function(){
            var req = {body: {Body:"  about  "} }
            mw.aboutResponder(req, res, next)

            sinon.assert.notCalled(next)
            sinon.assert.calledWith(res.render, 'about-partial')
            assert.equal(res.locals.action, "About")
        })
    })
    describe('stopNumberResponder', function(){
        var next, res, getStopsStub
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
                input = "1066"
                var req = {body: {Body:input} }
                mw.stopNumberResponder(req, res, next)
                sinon.assert.calledWith(getStopsStub, parseInt(input, 10))
            })
            it('Should not respond to non-numeric requests', function(){
                next = sinon.stub()
                var req = {body: {Body:"5th and G Street"} }
                mw.stopNumberResponder(req, res, next)
                sinon.assert.called(next)
                sinon.assert.notCalled(getStopsStub)
            })
            it('Should set res.locals.routes to the routes object', function(){
                var req = {body: {Body:"1066"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => {
                    assert.strictEqual(res.locals.routes, fakedata.stoptimes)
                })
            })
            it('Should set res.locals.action to "Stop Lookup"', function(){
                var req = {body: {Body:"99"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() =>  assert.equal(res.locals.action,  "Stop Lookup"))
            })
            it('Should respond to "stop"+number', function(){
                var req = {body: {Body:"stop 1066"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => sinon.assert.called(res.render))
            })
            it('Should respond to "#"+number', function(){
                var req = {body: {Body:"# 1066"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => sinon.assert.called(res.render))
            })
            it('Should be case insensitive', function(){
                var req = {body: {Body:"sTOp 1066"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => sinon.assert.called(res.render))
            })
            it('Should ignore white space', function(){
                var req = {body: {Body:" 1066   \n"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => sinon.assert.called(res.render))
            })
            it('Should respond with the correct template', function(){
                var req = {body: {Body:"1066"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => sinon.assert.calledWith(res.render, ('stop-list')))
            })
        })
        describe('With bad requests', function(){
            var error = new Error("Test Error")
            beforeEach(function(){
                res = {render: sinon.stub(), locals: {}}
                next = () => assert.fail("Next() called", "Middleware should have handled this case", undefined, 'when')
                getStopsStub = sinon.stub(lib, 'getStopFromStopNumber').rejects(error)
            })
            afterEach(function(){
                getStopsStub.restore()
            })
            it('Should render the returned error message when no stops are found', function(){
                var req = {body: {Body:"0"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => sinon.assert.calledWith(res.render, 'message', {message: error}))
            })
            it('Should set res.local.action to "Failed Stop Lookup"', function(){
                var req = {body: {Body:"0"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => assert.equal(res.locals.action, 'Failed Stop Lookup' ))
            })

        })
    })
    describe('addressResponder', function(){
        var next, res, getStopsStub
        beforeEach(function(){
            res = {render: sinon.stub(), locals: {}}
            getStopsStub = sinon.stub(geocode, 'stops_near_location')
            next = () => assert.fail("Next() called", "addressResponder should have handled this case", undefined, 'when')
        })
        afterEach(function(){
            getStopsStub.restore()
        })
        it('Should pass input directly to geocoder', function(){
            var input = "5th and G Street"
            getStopsStub.resolves(fakedata.stops_from_location)
            var req = {body: {Body:input} }
            return mw.addressResponder(req, res, next)
            .then(() =>  sinon.assert.calledWith(getStopsStub, input))
        })
        it('Should set res.locals.routes to the object returned from the geocoder', function(){
            getStopsStub.resolves(fakedata.stops_from_location)
            var req = {body: {Body:"5th and G Street"} }
            return mw.addressResponder(req, res, next)
            .then(() =>  assert.strictEqual(fakedata.stops_from_location, res.locals.routes))
        })
        it('Should render the "route-list" template', function(){
            getStopsStub.resolves(fakedata.stops_from_location)
            var req = {body: {Body:"5th and G Street"} }
            return mw.addressResponder(req, res, next)
            .then(() => sinon.assert.calledWith(res.render, 'route-list'))
        })
        it('Should send a "No Stops" message when no stops are found near location', function(){
            getStopsStub.resolves(fakedata.no_stops_near_location)
            var req = {body: {Body:"1800 Citation Road"} }
            return mw.addressResponder(req, res, next)
            .then(() => {
                assert(res.locals.message.message.includes(`${config.NEAREST_BUFFER} mile`))
                assert.equal(res.locals.message.name, "No Stops")
                sinon.assert.calledWith(res.render, 'message')
            })
        })
        it('Should call next() when the address is not found', function(){
            next = sinon.stub()
            var req = {body: {Body:"1800 Citation Road"} }
            var error = new Error()
            error.type = 'NOT_FOUND'
            getStopsStub.rejects(error)
            return mw.addressResponder(req, res, next)
            .then(() => sinon.assert.called(next))
        })
        it('Should render message for other errors', function(){
            var req = {body: {Body:"1800 Citation Road"} }
            var err = new Error("some other error")
            getStopsStub.rejects(err)
            return mw.addressResponder(req, res, next)
            .then(() => sinon.assert.calledWith(res.render, 'message', {message: err}))
        })
        it('Should set action to "Failed Address Lookup when address is not be found', function(){
            var req = {body: {Body:"1800 Citation Road"} }
            var err = new Error("some other error")
            getStopsStub.rejects(err)
            return mw.addressResponder(req, res, next)
            .then(() => assert.equal(res.locals.action, 'Failed Address Lookup'))
        })
    })
    describe('findLatLon', function(){
        var next, res, getStopsStub
        beforeEach(function(){
            res = {render: sinon.stub(), locals: {}}
            findStub = sinon.stub(geocode, 'findNearestStops')
            next = () => assert.fail("Next() called", "findLatLon should have handled this case", undefined, 'when')
        })
        afterEach(function(){
            findStub.restore()
        })
        it('Should call library function with provided lat/lon', function(){
            var [lat, lon] = ['61.2181', '149.9']
            var req = {query: {lat: lat, lon: lon} }
            mw.findbyLatLon(req, res, next)
            sinon.assert.calledWith(findStub, lat, lon)
        })
        it('Should return a message when location undetermined', function(){
            var req = {query: {lat: undefined, lon: undefined} }
            mw.findbyLatLon(req, res, next)
            sinon.assert.calledWith(res.render, 'message', {message: {message: "Can't determine your location"}})
        })
        it('Should return a message when location is found, but there are no stops nearby', function(){
            var [lat, lon] = ['61.2181', '149.9']
            var req = {query: {lat: lat, lon: lon} }
            findStub.returns([])
            mw.findbyLatLon(req, res, next)
            sinon.assert.calledWith(res.render, 'message', {message: {message: "No stops found near you"}})
        })
        it('Should render "route-list-partial" template when stops are found', function(){
            var [lat, lon] = ['61.2181', '149.9']
            var req = {query: {lat: lat, lon: lon} }
            findStub.returns(fakedata.stops_by_lat_lon)
            mw.findbyLatLon(req, res, next)
            sinon.assert.calledWith(res.render, 'route-list-partial')
        })
        it('Should pass stops to template', function(){
            var [lat, lon] = ['61.2181', '149.9']
            var req = {query: {lat: lat, lon: lon} }
            findStub.returns(fakedata.stops_by_lat_lon)
            mw.findbyLatLon(req, res, next)
            assert.deepEqual(res.render.args[0][1].routes.data.stops, fakedata.stops_by_lat_lon)
        })
    })
    describe("User Feedback", function(){
        var req, res, feedbackStub, logStub
        describe("send_feedback", function(){
            beforeEach(function(){
                req = {body: {comment: "A comment"}}
                res = {render: sinon.stub(), locals: {}}
                feedbackStub = sinon.stub(lib, 'processFeedback')
                logStub = sinon.stub(logger, 'error') // this just keeps the test errors off the console
            })
            afterEach(function(){
                feedbackStub.restore()
                logStub.restore()
            })
            it("Should set returnHTML flag", function(){
                feedbackStub.resolves()
                mw.feedbackResponder_web(req, res)
                assert.equal(res.locals.returnHTML, 1)
            })
            it('Should set actions to "feedback"', function(){
                feedbackStub.resolves()
                mw.feedbackResponder_web(req, res)
                assert.equal(res.locals.action, "Feedback")
            })
            it('Should call library function with the original request', function(){
                feedbackStub.resolves()
                mw.feedbackResponder_web(req, res)
                sinon.assert.calledWith(feedbackStub, req)
            })
            it('Should render message template with message', function(){
                feedbackStub.resolves()
                return mw.feedbackResponder_web(req, res)
                .then(() => sinon.assert.calledWith(res.render, 'message', {message: {message:'Thanks for the feedback'}}))
           })
           it('Should send a message to the user if there is an error', function(){
                feedbackStub.rejects(new Error("feedback error"))
                return mw.feedbackResponder_web(req, res)
                .then(() => sinon.assert.calledWith(res.render, 'message', {message: {message:'Error saving feedback, administrator notified'}}))
           })
           it('Should log an error when the feedback fails', function(){
            feedbackStub.rejects(new Error("feedback error"))
            return mw.feedbackResponder_web(req, res)
            .then(() => sinon.assert.called(logStub))
       })
        })
        describe("feedbackResponder", function(){
            var next, comment, res, req, feedbackStub, logStub
            beforeEach(function(){
                comment = "Some Comment"
                req = {body: {Body: config.FEEDBACK_TRIGGER + comment}}
                res = {send: sinon.stub(), locals: {}, set: sinon.stub()}
                feedbackStub = sinon.stub(lib, 'processFeedback')
                next = sinon.stub()
                logStub = sinon.stub(logger, 'error') // this just keeps the test errors off the console
            })
            afterEach(function(){
                feedbackStub.restore()
                logStub.restore()
            })
            it('Should only respond with the feedback trigger word', function(){
                feedbackStub.resolves()
                req = {body: {Body: "A comment"}}
                mw.feedbackResponder_sms(req, res, next)
                sinon.assert.called(next)
                sinon.assert.notCalled(res.send)
                sinon.assert.notCalled(res.set)
            })
            it("Should set content type to plain/text", function(){
                feedbackStub.resolves()
                mw.feedbackResponder_sms(req, res, next)
                sinon.assert.calledWith(res.set, 'Content-Type', 'text/plain')
            })
            it("Should set res.locals.action to 'Feedback'", function(){
                feedbackStub.resolves()
                mw.feedbackResponder_sms(req, res, next)
                assert.equal(res.locals.action, "Feedback")
            })
            it("Should call the library function with the message (without the trigger word) and the original request", function(){
                feedbackStub.resolves()
                mw.feedbackResponder_sms(req, res, next)
                sinon.assert.calledWith(feedbackStub, comment, req)
            })
            it("Should send a response", function(){
                feedbackStub.resolves()
                return mw.feedbackResponder_sms(req, res, next)
                .then(() => sinon.assert.calledWith(res.send, "Thanks for the feedback"))
            })
            it("Feedback trigger should be case insensitive ", function(){
                var trigger = config.FEEDBACK_TRIGGER.split('').map(char => Math.random() > .5 ? char.toUpperCase() : char).join('')
                req = {body: {Body: trigger + comment}}
                feedbackStub.resolves()
                mw.feedbackResponder_sms(req, res, next)
                .then(()=> sinon.assert.calledWith(res.send, "Thanks for the feedback"))
            })
            it("Should send a response on failure", function(){
                feedbackStub.rejects()
                return mw.feedbackResponder_sms(req, res, next)
                .then(() => sinon.assert.calledWith(res.send, "Error saving feedback, administrator notified."))
            })
            it("Should log an error on failure", function(){
                var error = new Error("Feedback Error")
                feedbackStub.rejects(error)
                return mw.feedbackResponder_sms(req, res, next)
                .then(() => sinon.assert.calledWith(logStub, error))
            })
        })
        describe("feedback_response_get_form", function(){
            var  comment, res, jsonStub
            const next = sinon.stub()
            beforeEach(function(){
                res = {render: sinon.stub(), sendStatus: sinon.stub()}
                jsonStub = sinon.stub(JSON, 'parse').returns(comment_fixture)
            })
            afterEach(function(){
                feedbackStub.restore()
                jsonStub.restore()
            })
            it('Should respond with the correct comment found from given hash', function(){
                var expected_obj = {
                    pageData: {
                        feedback: 'Findme',
                        hash: "7d93f9a99c766418a33e5f334ad973a3e1da4494",
                        phone: '9078548077'
                    }}
                var req = {query:{hash: expected_obj.pageData.hash}}
                mw.feedback_get_form(req, res, next)
                sinon.assert.calledWith(res.render, 'respond', expected_obj)
            })
            it('Should return 404 if comment is not found', function(){
                var req = {query: {hash: "0093f9a99c766418jk4e5f334ad973a3e1da1234"}}
                mw.feedback_get_form(req, res, next)
                sinon.assert.notCalled(res.render)
                sinon.assert.calledWith(res.sendStatus, 404)
            })
            it('Should return 404 for found comments without phone', function(){
                var req = {query: {hash: "7d6a9ecc52f3e9bd86868a878fbd4chfa06dd822"}}
                mw.feedback_get_form(req, res, next)
                sinon.assert.notCalled(res.render)
                sinon.assert.calledWith(res.sendStatus, 404)
            })
        })
        describe("send_feedback_response", function(){
            var  comment, res, jsonStub, twilioStub, expected_obj, next, loggerStub
            beforeEach(function(){
                loggerStub = sinon.stub(logger, 'error')
                next = sinon.stub()
                res = {render: sinon.stub()}
                twilioStub = sinon.stub(twilioClient.messages, 'create')
                jsonStub = sinon.stub(JSON, 'parse').returns(comment_fixture)
                expected_obj = {
                    pageData: {
                        feedback: 'Findme',
                        hash: "7d93f9a99c766418a33e5f334ad973a3e1da4494",
                        phone: '9078548077'
                    }}
            })
            afterEach(function(){
                jsonStub.restore()
                twilioStub.restore()
                loggerStub.restore()
            })
            it("Should respond to the correct comment", function(){
                var response = "Some random response"
                var req = {body:{hash: expected_obj.pageData.hash, response:response}}
                mw.send_feedback_response(req, res, next)
                sinon.assert.calledWith(twilioStub, {
                    to: expected_obj.pageData.phone,
                    from: config.MY_PHONE,
                    body: response
                })
            })
            it("Should respond with a message if the comment was not found", function(){
                var response = "Some random response"
                var req = {body:{hash: '000', response:response}}
                mw.send_feedback_response(req, res, next)
                sinon.assert.calledWith(res.render, "message", {message: {message:'Error: The original comment was not found!?!'}})
            })
            it('Should send a response back with correct number after posting Twilio message', function(){
                twilioStub.yieldsAsync(null, "success")
                var response = "Some random response"
                var req = {body: {hash: expected_obj.pageData.hash, response: response}}
                var entry = {response: response, to_phone: expected_obj.pageData.phone}
                mw.send_feedback_response(req, res, next)
                setImmediate(() => sinon.assert.calledWith(res.render, "response", {pageData: {err: null, entry: entry}}))
            })
            it('Should render a response with the error if twilio fails', function(){
                var err = new Error("Twilio Error")
                twilioStub.yieldsAsync(err, null)
                var req = {body: {hash: expected_obj.pageData.hash, response: "response"}}
                mw.send_feedback_response(req, res, next)
                setImmediate(() => sinon.assert.calledWith(res.render, "response", {pageData: {err: err}}))
            })
            it('Should log an error if twilio fails', function(){
                var err = new Error("Twilio Error")
                twilioStub.yieldsAsync(err, null)
                var req = {body: {hash: expected_obj.pageData.hash, response: "response"}}
                mw.send_feedback_response(req, res, next)
                setImmediate(() => sinon.assert.calledWith(loggerStub, err))
            })
        })
        describe("askWatson", function(){
            var watsonStub, next, res, req
            beforeEach(function(){
                next = sinon.stub()
                watsonStub = sinon.createStubInstance(watson.conversation)
             //   messageStub = sinon.stub(watson.ConversationV1.prototype, 'message')

                res = {send: sinon.stub(), locals: {}, set: sinon.stub()}
                req = {body: {Body: "a question"}, cookies:{}}
            })
            afterEach(function(){
            //    messageStub.restore()
                watsonStub.restore()
            })
            it("should do something", function(){
                mw.askWatson(req, res, next)
               // sinon.assert.called(messageStub)
                sinon.assert.called(watsonStub)

            })
        })
    })
})
