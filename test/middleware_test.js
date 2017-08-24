const httpMocks = require('node-mocks-http'),
      express = require('express'),
      assert = require('assert'),
      sinon = require('sinon'),
      lib = require('../lib/bustracker')
      geocode = require('../lib/geocode')
      logger = require('../lib/logger')
      config = require('../lib/config')


const mw = require('../routes/middleware')
      fakedata = require('./fixtures/stopdata')


describe('Middleware Function', function(){
    describe('sanitizeInput', function(){
        var next = sinon.stub()
        var res = {}
        it('Should remove all lines except the first', function(){
            var req = {body: {Body:"Line One\nLine Two\nLine Three"} }
            mw.sanitizeInput(req, res, next)
            assert(req.body.Body === "Line One")
        })
        it('Should replace tabs with a single space', function(){
            var req = {body: {Body:"One\tTwo\t\t\tThree"} }
            mw.sanitizeInput(req, res, next)
            assert(req.body.Body === "One Two Three")
        })
        it('Should remove emojis', function(){
            var req = {body: {Body:"5th and G 💋Street👍"} }
            mw.sanitizeInput(req, res, next)
            assert(req.body.Body === "5th and G Street")
        })
        it('Should not change normal input', function(){
            var req = {body: {Body:"1066"} }
            mw.sanitizeInput(req, res, next)
            assert(req.body.Body === "1066")
        })
        it('Should call next() when finished', function(){
            var req = {body: {Body:"1066"} }
            mw.sanitizeInput(req, res, next)
            assert(next.called)
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
            assert(res.render.notCalled)
            assert(next.called)
        })
        it('Should render a message on holidays', function(){
            libStub.returns(true)
            mw.checkServiceExceptions({}, res, next)
            assert(res.render.called)
            assert(next.notCalled)
        })
        it('Should set res.locals on holidays', function(){
            libStub.returns(true)
            mw.checkServiceExceptions({}, res, next)
            assert(res.locals.message && res.locals.message.hasOwnProperty('message'))
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

            assert(next.notCalled)
            assert(res.render.called)
        })
        it("Should set res.locals.action with whitespace input and call render", function(){
            var req = {body: {Body:"   "} }
            mw.blankInputRepsonder(req, res, next)
            assert(res.locals.action === 'Empty Input')
            res.locals.action = ""

            var req = {body: {Body:"\t\n   \r\n"} }
            mw.blankInputRepsonder(req, res, next)
            assert(res.locals.action === 'Empty Input')

            assert(next.notCalled)
            assert(res.render.calledTwice)
        })
        it('Should call next() when input is not blank', function(){
            var req = {body: {Body:"1066"} }
            mw.blankInputRepsonder(req, res, next)
            assert(next.called)
            assert(res.render.notCalled)
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

            assert(next.calledThrice)
            assert(res.render.notCalled)
        })
        it("Should respond to About and send proper template", function(){
            var req = {body: {Body:"About"} }
            mw.aboutResponder(req, res, next)

            assert(next.notCalled)
            assert(res.render.calledWith('about-partial'))
            assert(res.locals.action === "About")
        })
        it("Should be case insensitive", function(){
            var req = {body: {Body:"abOUt"} }
            mw.aboutResponder(req, res, next)

            assert(next.notCalled)
            assert(res.render.calledWith('about-partial'))
            assert(res.locals.action === "About")
        })
        it("Should work with whitespace padding", function(){
            var req = {body: {Body:"  about  "} }
            mw.aboutResponder(req, res, next)

            assert(next.notCalled)
            assert(res.render.calledWith('about-partial'))
            assert(res.locals.action === "About")
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
                assert(getStopsStub.calledWith(parseInt(input, 10)))
            })
            it('Should not respond to non-numeric requests', function(){
                next = sinon.stub()
                var req = {body: {Body:"5th and G Street"} }
                mw.stopNumberResponder(req, res, next)
                assert(next.called)
                assert(getStopsStub.notCalled)
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
                .then(() =>  assert(res.locals.action === "Stop Lookup"))
            })
            it('Should respond to "stop"+number', function(){
                var req = {body: {Body:"stop 1066"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => assert(res.render.called))
            })
            it('Should respond to "#"+number', function(){
                var req = {body: {Body:"# 1066"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => assert(res.render.called))
            })
            it('Should be case insensitive', function(){
                var req = {body: {Body:"sTOp 1066"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => assert(res.render.called))
            })
            it('Should ignore white space', function(){
                var req = {body: {Body:" 1066   \n"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => assert(res.render.called))
            })
            it('Should respond with the correct template', function(){
                var req = {body: {Body:"1066"} }
                return mw.stopNumberResponder(req, res, next)
                .then(() => assert(res.render.calledWith('stop-list')))
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
                .then(() => res.render.calledWith('message', {message: error}))
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
            .then(() =>  assert(getStopsStub.calledWith(input)))
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
            .then(() => assert(res.render.calledWith('route-list')))
        })
        it('Should send a "No Stops" message when no stops are found near location', function(){
            getStopsStub.resolves(fakedata.no_stops_near_location)
            var req = {body: {Body:"1800 Citation Road"} }
            return mw.addressResponder(req, res, next)
            .then(() => {
                assert(res.locals.message.message.includes(`${config.NEAREST_BUFFER} mile`))
                assert.equal(res.locals.message.name, "No Stops")
                assert(res.render.calledWith('message'))
            })
        })
        it('Should call next() when the address is not found', function(){
            next = sinon.stub()
            var req = {body: {Body:"1800 Citation Road"} }
            var error = new Error()
            error.type = 'NOT_FOUND'
            getStopsStub.rejects(error)
            return mw.addressResponder(req, res, next)
            .then(() => assert(next.called))
        })
        it('Should render message for other errors', function(){
            var req = {body: {Body:"1800 Citation Road"} }
            var err = new Error("some other error")
            getStopsStub.rejects(err)
            return mw.addressResponder(req, res, next)
            .then(() => assert(res.render.calledWith('message', {message: err})))
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
            assert(findStub.calledWith(lat, lon))
        })
        it('Should return a message when location undetermined', function(){
            var req = {query: {lat: undefined, lon: undefined} }
            mw.findbyLatLon(req, res, next)
            assert(res.render.calledWith('message', {message: {message: "Can't determine your location"}}))
        })
        it('Should return a message when location is found, but there are no stops nearby', function(){
            var [lat, lon] = ['61.2181', '149.9']
            var req = {query: {lat: lat, lon: lon} }
            findStub.returns([])
            mw.findbyLatLon(req, res, next)
            assert(res.render.calledWith('message', {message: {message: "No stops found near you"}}))
        })
        it('Should render "route-list-partial" template when stops are found', function(){
            var [lat, lon] = ['61.2181', '149.9']
            var req = {query: {lat: lat, lon: lon} }
            findStub.returns(fakedata.stops_by_lat_lon)
            mw.findbyLatLon(req, res, next)
            assert(res.render.calledWith('route-list-partial'))
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
                mw.send_feedback(req, res)
                assert.equal(res.locals.returnHTML, 1)
            })
            it('Should set actions to "feedback"', function(){
                feedbackStub.resolves()
                mw.send_feedback(req, res)
                assert.equal(res.locals.action, "Feedback")
            })
            it('Should call library function with the original request', function(){
                feedbackStub.resolves()
                mw.send_feedback(req, res)
                assert(feedbackStub.calledWith(req))
            })
            it('Should render message template with message', function(){
                feedbackStub.resolves()
                return mw.send_feedback(req, res)
                .then(() => assert(res.render.calledWith('message', {message: {message:'Thanks for the feedback'}})))
           })
           it('Should send a message to the user if there is an error', function(){
                feedbackStub.rejects(new Error("feedback error"))
                return mw.send_feedback(req, res)
                .then(() => assert(res.render.calledWith('message', {message: {message:'Error saving feedback, administrator notified'}})))
           })
           it('Should log an error when the feedback fails', function(){
            feedbackStub.rejects(new Error("feedback error"))
            return mw.send_feedback(req, res)
            .then(() => assert(logStub.called))
       })
        })
        describe("feedbackResponder", function(){
            var next, comment
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
                mw.feedbackResponder(req, res, next)
                assert(next.called)
                assert(res.send.notCalled)
                assert(res.set.notCalled)
            })
            it("Should set content type to plain/text", function(){
                feedbackStub.resolves()
                mw.feedbackResponder(req, res, next)
                assert(res.set.calledWith('Content-Type', 'text/plain'))
            })
            it("Should set res.locals.action to 'Feedback'", function(){
                feedbackStub.resolves()
                mw.feedbackResponder(req, res, next)
                assert.equal(res.locals.action, "Feedback")
            })
            it("Should call the library function with the message (without the trigger word) and the original request", function(){
                feedbackStub.resolves()
                mw.feedbackResponder(req, res, next)
                assert(feedbackStub.calledWith(comment, req))
            })
            it("Should send a response", function(){
                feedbackStub.resolves()
                return mw.feedbackResponder(req, res, next)
                .then(() => assert(res.send.calledWith("Thanks for the feedback")))
            })
            it("Feedback trigger should be case insensitive ", function(){
                var trigger = config.FEEDBACK_TRIGGER.split('').map(char => Math.random() > .5 ? char.toUpperCase() : char).join('')
                req = {body: {Body: trigger + comment}}
                feedbackStub.resolves()
                mw.feedbackResponder(req, res, next)
                .then(()=> assert(res.send.calledWith("Thanks for the feedback")))
            })
            it("Should send a response on failure", function(){
                feedbackStub.rejects()
                return mw.feedbackResponder(req, res, next)
                .then(() => assert(res.send.calledWith("Error saving feedback, administrator notified.")))
            })
            it("Should log an error on failure", function(){
                var error = new Error("Feedback Error")
                feedbackStub.rejects(error)
                return mw.feedbackResponder(req, res, next)
                .then(() => assert(logStub.calledWith(error)))
            })
        })
    })
})
