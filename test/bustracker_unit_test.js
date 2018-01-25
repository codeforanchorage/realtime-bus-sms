'use strict';

const assert    = require('assert')
    , nock      = require('nock')
    , config    = require('../lib/config')
    , logger    = require('../lib/logger')
    , sinon     = require('sinon')
    , moment    = require('moment-timezone')


const bustracker            = require('../lib/bustracker')
    , { URL }               = require('url')
    , muniURL               = new URL(config.MUNI_URL)
    , responses             = require('./fixtures/muniResponse')
    , gtfs                  = require('../lib/gtfs')
    , stopNumber            = 3

describe('Bustracker Module', function() {
    before(function(){ nock.disableNetConnect()})
    after(function(){ nock.enableNetConnect()})

    describe('With a good Muni response', function(){
        let get, nockscope, clock
        const startTime = 100
        beforeEach(function() {
            nockscope = nock(muniURL.origin).get(muniURL.pathname)
            .query({stopid: gtfs.stop_number_lookup[stopNumber]})
            .reply(200, responses.goodResponse )
            clock = sinon.useFakeTimers({now: startTime})
            get = bustracker.getStopFromStopNumber(stopNumber)
        })
        afterEach(function(){
            clock.restore();
        })
        it('Should call the correct muni URL', function(){
            return get.then(r => nockscope.done(), err => nockscope.done())
        })
        it('Should return an object with the stop number', function(){
            return get.then(r => assert.equal(r.data.stopId, stopNumber))
        })
        it('Should return an object with the processing time', function(){
            clock.tick(200)
            return get.then(r => { assert.equal(200, r.muniTime)})
        })
        it('Should return an object with a stop string matching name returned from muni', function(){
            return get.then(r => assert.equal(r.data.stop, 'DOWNTOWN TRANSIT CENTER'))
        })
        it('Should return an array of Stops', function(){
            return get.then(r => assert((Array.isArray(r.data.stops))))
        })
        it('Should return an array of stop objects each with a stop number', function(){
            return get.then(r => assert(r.data.stops.every(stop => /^\d+$/.test(stop.number))))
        })
        it('Should return array of stops with stop name', function(){
            const dir_rx = /^(.*) - (?:Inbound|Outbound|Loop)$/
            return get.then(r => assert(r.data.stops.every(stop => dir_rx.test(stop.name))))
        })
        it('Should return an array of stop objects each with an array of times', function(){
            const timeRX = /^(1[0-2]|[1-9]):([0-5][0-9])\s?(AM|PM)$/ // 12:40 PM format no leading zeros
            return get.then( r =>
                assert(r.data.stops.every(stop => stop.times.every(time => {
                    return timeRX.test(time)
                })))
            )
        })
        it('Should return an array of stop objects each with a name string', function(){
            return get.then(r => assert(r.data.stops.every(stop => stop.name && typeof stop.name == 'string' )))
        })
    })
    describe('With an result different than expected', function(){
        let get, nockscope, logstub
        beforeEach(function() {
            logstub = sinon.stub(logger, 'error')
            nockscope = nock(muniURL.origin).get(muniURL.pathname)
                        .query({stopid: gtfs.stop_number_lookup[stopNumber]})
        })
        afterEach(function(){
            logstub.restore()
        })
        it('Should respond with error and log it when muni returns a bad response data', function(){
            nockscope.reply(200, responses.unexpectedResponse )

            return bustracker.getStopFromStopNumber(stopNumber)
            .then(r => {throw new Error("Promise should not be fulfilled when Muni send bad data")},
                  err => {
                    assert(err.message.includes('Sorry, Bustracker is down'))
                    sinon.assert.calledWithMatch(logstub, sinon.match.has('type', 'MUNI_ERROR' ), sinon.match.has('htmlBody').and(sinon.match.has('stopID')))
                }
            )
        })
        it('Should respond with error and log it with non-2xx Status', function(){
            nockscope.reply(404)
            return bustracker.getStopFromStopNumber(stopNumber)
            .then(r => {throw new Error("Promise should not be fulfilled when Muni send bad data")},
                  err => {
                     assert(err.message.includes('Sorry, Bustracker is down'))
                     sinon.assert.calledWith(logstub, sinon.match.has('type', 'MUNI_ERROR' ).and(sinon.match.has('message', 'Muni Server returned status code: 404')))
                }
            )
        })
        it("Should return an out of service message when a route reports finished", function(){
            nockscope.reply(200, responses.outofservice )
            return bustracker.getStopFromStopNumber(stopNumber)
            .then(r => assert(r.data.stops.every(stop => stop.times.every(time => time == 'Out of Service'))))

        })

    })

    describe('With bad input', function(){
        it('Respond with a helpful error with empty input', function(){
            return bustracker.getStopFromStopNumber()
            .then(r => {throw new Error("Promise should not be fulfilled with empty input")},
                  err => assert(err.message.includes('Stop numbers are on the bus stop sign'))
                )
        })
        it("Respond with an error when given a number that doesn't match a stop", function(){
            const badNumber = 12928
            return bustracker.getStopFromStopNumber(badNumber)
            .then(r => {throw new Error("Promise should not be fulfilled when bus number isn't found")},
                  err => {
                      assert(err.message.includes('Stop numbers are on the bus stop sign'))
                      assert.equal(err.name, `I couldn't find stop number ${badNumber}`)
                    }
                )
        })
        it("Respond with an error with nonesense input", function(){
            return bustracker.getStopFromStopNumber('tpoipoit#$')
            .then(r => {throw new Error("Promise should not be fulfilled with empty input")},
                  err => {
                      assert(err.message.includes('Stop numbers are on the bus stop sign'))
                    }
                )
        })
    })

    describe('Service Exceptions', function(){
        let clock
        afterEach(function(){
            clock.restore();
        })
        it('Should respond true when today is in service exceptions', function(){
            const anException = gtfs.exceptions.find(ex => ex.exception_type == 2)
            clock = sinon.useFakeTimers(moment.tz(anException.date, 'YYYYMMDD', config.TIMEZONE).valueOf())
            assert(bustracker.serviceExceptions())
        })
        it('Should respond false when today is not in service exceptions', function(){
            clock = sinon.useFakeTimers(100) // assumes start of epoch is not in service exceptions
            assert(!bustracker.serviceExceptions())
        })

    })
})
