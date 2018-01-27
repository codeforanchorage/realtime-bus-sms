'use strict';

const assert     = require('assert')
const util       = require('util')
const rollbar    = require("rollbar")
const sinon      = require('sinon')
const ua         = require('universal-analytics')
const onFinished = require('on-finished')
const onHeaders  = require('on-headers')
const logs       = require('../lib/logger')
const winston    = require('winston')
const config     = require('../lib/config')

describe('Logging middleware', function(){
    let middleware, mockReq, mockRes, nextStub,loggerstub

    beforeEach(function(){
       mockReq = {
           url: "/find",
           method: 'get',
           ip: '127.0.0.1',
           get(str) {return str === 'user-agent' ? 'Safari' : null},
           phone: '9070000000'
       }
       mockRes = {
           locals: {routes: "testRoute", action: 'testAction'},
           statusCode: '200',
           session: "mockSession",
           writeHead() {}
       }
       middleware = logs.initialize(sinon.stub())
       nextStub = sinon.stub()
       loggerstub = sinon.stub(logs, 'info')
    })
    afterEach(function(){
        loggerstub.restore()
    })

    it('Should return a function', function(){
        assert(typeof middleware === 'function')
    })
    it('Should call next()', function(){
        middleware(mockReq, mockRes, nextStub)
        assert(nextStub.called)
    })
    it('Should call logger with default fields set by res and req objects', function(done){
        middleware(mockReq, mockRes, nextStub)
        setImmediate(() => {
            let obj = loggerstub.args[0][0]
            assert.equal(obj.status, mockRes.statusCode)
            assert.equal(obj.url, mockReq.url)
            assert.equal(obj.ip, mockReq.ip)
            assert.equal(obj.uuid, mockRes.session)
            done()
        })
    })
    it('Should call logger with additional fields passed into init function', function(done){
        let initFunc = (req, res) => ({
            phone:  req.phone,
            action: res.locals.action
        })
        let custom_middleware = logs.initialize(initFunc)
        custom_middleware(mockReq, mockRes, nextStub)
        setImmediate(() => {
            let obj = loggerstub.args[0][0]
            assert.equal(obj.phone, mockReq.phone)
            assert.equal(obj.action, mockRes.locals.action)
            done()
        })
    })
    it('Should not log Elastic Load Balancer requests', function(done){
        mockReq.get = (str) => str === 'user-agent' ? 'ELB-HealthChecker' : 'null'
        middleware(mockReq, mockRes, nextStub)
        setImmediate(() => {
            assert(loggerstub.notCalled)
            assert(nextStub.called)
            done()
        })
    })
    it('Should not log requests for css resources', function(done){
        mockReq.url = '/css/someStlye.css'
        middleware(mockReq, mockRes, nextStub)
        setImmediate(() => {
            assert(loggerstub.notCalled)
            assert(nextStub.called)
            done()
        })
    })
    it('Should not log requests for javascript resources', function(done){
        mockReq.url = '/javascripts/script.js'
        middleware(mockReq, mockRes, nextStub)
        setImmediate(() => {
            assert(loggerstub.notCalled)
            assert(nextStub.called)
            done()
        })
    })
    it('Should not log requests for image resources', function(done){
        mockReq.url = '/img/shirtless_mark_on_a_bus.img'
        middleware(mockReq, mockRes, nextStub)
        mockRes.writeHead()
        setImmediate(() => {
            assert(loggerstub.notCalled)
            assert(nextStub.called)
            done()
        })
    })
    it('Should log time between starting middleware and sending headers', function(done){
        let timeTick = 200
        let clock = sinon.useFakeTimers({
            shouldAdvanceTime: true
        });
        middleware(mockReq, mockRes, nextStub)
        clock.tick(timeTick);
        mockRes.writeHead() // manually call to force onHeaders to fire actions
        setImmediate(() => {
            let obj = loggerstub.args[0][0]
            assert.equal(timeTick, obj.responseTime)
            clock.restore()
            done()
        })
    })
    it('Should log current timestamp', function(done){
        let timeTick = 20
        let clock = sinon.useFakeTimers({
            now: 1483228800000, /* new year 2017, midnight zulu */
            shouldAdvanceTime: true
        });
        middleware(mockReq, mockRes, nextStub)
        clock.tick(timeTick);
        mockRes.writeHead()
        setImmediate(() => {
            let obj = loggerstub.args[0][0]
            assert.equal(obj.timestamp, '2017-01-01T00:00:00.0' + timeTick + 'Z')
            clock.restore()
            done()
        })
    })
})

describe('Google Analytics Transport', function(){
    let pageviewStub, eventStub, timingStub, sendStub, logWarning, setStub
    before(function(){
        logs.transports['console.info'].silent = true
    })
    after(function(){
        logs.transports['console.info'].silent = false
    })
    beforeEach(function(){
        pageviewStub = sinon.stub(ua.Visitor.prototype, 'pageview').returns({
            send:  () => sinon.stub()
        })
        eventStub = sinon.stub(ua.Visitor.prototype, 'event')
        timingStub = sinon.stub(ua.Visitor.prototype, 'timing')
        sendStub = sinon.stub(ua.Visitor.prototype, 'send')
        setStub = sinon.stub(ua.Visitor.prototype, 'set')
        logWarning = sinon.stub(logs, 'warn')
    })
    afterEach(function(){
        pageviewStub.restore()
        eventStub.restore()
        timingStub.restore()
        sendStub.restore()
        logWarning.restore()
        setStub.restore()
    })
    describe('With normal init settings', function(){
        let uuid = 'somUUID'
        let testMeta =
            {
                category: 'testCategory',
                action: 'testAction',
                label: 'testID',
                value: 'testValue',
                url: 'testURL',
                timings: [{name:'muniTime', time: 100}],
                responseTime: 200
            }
        beforeEach(function(){
            logs.initGoogleAnalytics((logFields) => Object.assign({uuid:'somUUID', trackingCode: config.GOOGLE_ANALYTICS_ID}, logFields))
        })
        afterEach(function(){
            logs.remove(logs.transports['Google-Analytics'])
        })

        it("Should add the GA Transport to the logger's transports", function(){
            assert(logs.transports['Google-Analytics'])
        })
        it("Should be an instance of winston Transport", function(){
            assert(logs.transports['Google-Analytics'] instanceof winston.Transport)
        })
        it("Should set a UUID for each hit", function(){
            logs.info('Test Hit')
            assert(setStub.calledWith('uid',uuid ))
        })
        it("Should send a pageview with the url when event is not sent", function(){
            let url = 'http://example.com'
            logs.info({url: url})
            assert(pageviewStub.calledWith(url))
        })
        it("Should log a warning if pageview fails", function(){
            let url = 'http://example.com'
            let errorString = 'some_google_error'
            pageviewStub.yields(errorString)
            logs.info({url: url})
            assert.equal(logWarning.args[0][1], errorString)
        })
        it("Should send an event with correct fields ", function(){
            logs.info(testMeta)
            let sentData = eventStub.args[0][0]
            assert.equal(sentData.ec, testMeta.category)
            assert.equal(sentData.ea, testMeta.action)
            assert.equal(sentData.el, testMeta.label)
            assert.equal(sentData.ev, testMeta.value)
            assert.equal(sentData.dp, testMeta.url)
        })
        it("Should log a warning if event() fails", function(){
            let errorString = 'some_google_event_error'
            eventStub.yields(errorString)
            logs.info(testMeta)
            assert.equal(logWarning.args[0][1], errorString)
        })
        it('Should send event to Google', function(){
            logs.info(testMeta)
            assert(sendStub.called)
        })
        it('Should send respsonse time to Google', function(){
            logs.info(testMeta)
            assert(timingStub.calledWith('Response Time', 'Total Time', testMeta.responseTime ))
        })
        it('Should send user timings to Google', function(){
            logs.info(testMeta)
            assert(timingStub.calledWith('Response Time', testMeta.timings[0].name, testMeta.timings[0].time ))
        })
    })
    describe("With bad init settings", function(){
        afterEach(function(){
            logs.remove(logs.transports['Google-Analytics'])
        })
        it("Should warn and return when used without tracking code", function(){
            logs.initGoogleAnalytics(() => ({uuid:'somUUID'}))
            logs.info("Test Hit")
            assert(logWarning.called)
            assert([pageviewStub, eventStub, sendStub].every(stub => stub.notCalled) )
        })
    })
})

describe("Rollbar Transport", function(){
    let rollbarStub
    beforeEach(function(){
        rollbarStub = sinon.stub(rollbar, 'handleError')
        logs.transports['console.info'].silent = true
    })
    afterEach(function(){
        rollbarStub.restore()
        logs.transports['console.info'].silent = false
    })
    it("Should send error-level log events to Rollbar", function(){
        logs.error(new Error("this is a random test error"))
        assert(rollbarStub.called)
    })
    it("Should not send events to Rollbar when log events are lower than error", function(){
        logs.info(new Error("This was not logged as an error"))
        assert(rollbarStub.notCalled)
        logs.warn(new Error("This was not logged as an error"))
        assert(rollbarStub.notCalled)
    })
    it('Should send Error instance to rollbar', function(){
        let error = new Error("An Error")
        logs.error(error)
        assert(rollbarStub.calledWith(error))
    })
    it('Should send Error and addition message to rollbar', function(){
        let error = new Error("An Error")
        let metaObject = {foo: 'bar'}
        let rollbarStub_ErrorWithPayload = sinon.stub(rollbar, 'reportMessageWithPayloadData')
        logs.error(error, metaObject)
        assert(rollbarStub_ErrorWithPayload.calledWith(util.format(error), {custom: metaObject}))
        rollbarStub_ErrorWithPayload.restore()
    })

})