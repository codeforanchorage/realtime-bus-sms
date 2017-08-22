const assert = require('assert'),
      nock = require('nock'),
      config = require('../lib/config'),
      logger = require('../lib/logger'),
      sinon = require('sinon'),
      moment = require('moment-timezone')


const bustracker = require('../lib/bustracker'),
      { URL } = require('url'),
      muniURL = new URL(config.MUNI_URL),
      responses = require('./fixtures/muniResponse'),
      stop_number_lookup = require('../lib/stop_number_lookup'),
      stop = require('../gtfs/geojson/stops.json')['features'][0],
      stopNumber = parseInt(stop.properties.stop_id),
      exceptions = require('../gtfs/geojson/exceptions.json')


describe('Test Bustracker Module', function() {
    before(function(){ nock.disableNetConnect()})
    after(function(){ nock.enableNetConnect()})
    afterEach(function(){ nock.cleanAll()})


    describe('With a good Muni response', function(){
        var get, nockscope
        beforeEach(function() {
            nockscope = nock(muniURL.origin).get(muniURL.pathname)
                   .query({stopid: stop_number_lookup[stopNumber]})
                   .reply(200, responses.goodResponse )
            get = bustracker.getStopFromStopNumber(stopNumber)
        })
        it('Should call the correct muni URL', function(){
            return get.then(r => nockscope.done(), err => nockscope.done())
        })
        it('Should return an object with the stop number', function(){
            return get.then(r => assert(r.data.stopId == stopNumber))
        })
        it('Should return an object with a processing time', function(){
            return get.then(r => assert(Number.isInteger(r.muniTime)))
        })
        it('Should return an object with a stop string matching name returned from muni', function(){
            return get.then(r => assert(r.data.stop == 'DOWNTOWN TRANSIT CENTER'))
        })
        it('Should return an array of Stops', function(){
            return get.then(r => assert((Array.isArray(r.data.stops))))
        })
        it('Should return an array of stop objects each with a stop number', function(){
            return get.then(r => assert(r.data.stops.every(stop => Number.isInteger(stop.number))))
        })
        it('Should return an array of stop objects each with an array of times', function(){
            return get.then( r=> assert(r.data.stops.every(stop => stop.times.every(time => {
                    timeRX = /^(1[0-2]|[1-9]):([0-5][0-9])\s?(AM|PM)$/ // 12:40 PM format no leading zeros
                    return timeRX.test(time)
                })))
            )
        })
        it('Should return an array of stop objects each with a name string', function(){
            return get.then(r => assert(r.data.stops.every(stop => stop.name && typeof stop.name == 'string' )))
        })
    })
    describe('With an result different than expected', function(){
        var get, nockscope
        beforeEach(function() {
            nockscope = nock(muniURL.origin).get(muniURL.pathname)
                   .query({stopid: stop_number_lookup[stopNumber]})
        })
        it('Should respond with error and log it when muni returns a bad response data', function(){
            nockscope.reply(200, responses.unexpectedResponse )
            var logs = sinon.stub(logger, 'error')
            return bustracker.getStopFromStopNumber(stopNumber)
            .then(r => {throw new Error("Promise should not be fulfilled when Muni send bad data")},
                  err => {
                    assert(err.message.includes('Sorry, Bustracker is down'))
                    assert(logs.called && logs.args[0][0].type == 'MUNI_ERROR' )
                    assert(logs.args[0][1].htmlBody && logs.args[0][1].stopID)
                    logs.restore()
                }
            )
        })

        it('Should respond with error and log it with non-2xx Status', function(){
            nockscope.reply(404)
            var logs = sinon.stub(logger, 'error')
            return bustracker.getStopFromStopNumber(stopNumber)
            .then(r => {throw new Error("Promise should not be fulfilled when Muni send bad data")},
                  err => {
                     assert(err.message.includes('Sorry, Bustracker is down'))
                     assert(logs.called && logs.args[0][0].message == 'Muni Server returned status code: 404' )
                    logs.restore()
                }
            )
        })
    })

    describe('With bad input', function(){
        var get, nockscope
        beforeEach(function() {
            nockscope = nock(muniURL.origin).get(muniURL.pathname)
                    .query({stopid: stop_number_lookup[stopNumber]})
                    .reply(200)
        })
        it('Respond with a helpful error with empty input', function(){
            return bustracker.getStopFromStopNumber()
            .then(r => {throw new Error("Promise should not be fulfilled with empty input")},
                  err => assert(err.message.includes('Stop numbers are on the bus stop sign'))
                )
        })
        it("Respond with an error when given a number that doesn't match a stop", function(){
            var badNumber = 12928
            return bustracker.getStopFromStopNumber(badNumber)
            .then(r => {throw new Error("Promise should not be fulfilled with empty input")},
                  err => {
                      assert(err.message.includes('Stop numbers are on the bus stop sign'))
                      assert(err.name == `I couldn't find stop number ${badNumber}`)
                    }
                )
        })
        it("Respond with an error with nonesense input", function(){
            return bustracker.getStopFromStopNumber('tpoipoit')
            .then(r => {throw new Error("Promise should not be fulfilled with empty input")},
                  err => {
                      assert(err.message.includes('Stop numbers are on the bus stop sign'))
                    }
                )
        })
    })

    describe('Service Exceptions', function(){
        it('Should respond true when today is in service exceptions', function(){
            var anException = exceptions.exceptions.find(ex => ex.exception_type == 2)
            clock = sinon.useFakeTimers(moment(anException.date, 'YYYYMMDD').valueOf())
            assert(bustracker.serviceExceptions())
            clock.restore();
        })
        it('Should respond false when today is not in service exceptions', function(){
            clock = sinon.useFakeTimers(0) // assumes start of epoch is not in service exceptions
            assert(!bustracker.serviceExceptions())
            clock.restore();
        })

    })
})
