'use strict';

const assert    = require('assert')
    , config    = require('../lib/config')
    , logger    = require('../lib/logger')
    , gtfs      = require("../lib/gtfs")
    , sinon     = require('sinon')
    , moment    = require('moment-timezone')
    , child_pr  = require('child_process')

describe('GTFS Module', function() {
        before(function(){
            logger.transports['console.info'].silent = true
        })
        after(function(){
            logger.transports['console.info'].silent = false
         })

    describe('Service Exceptions', function(){
        let clock
        afterEach(function(){
            clock.restore();
        })
        it('Should respond true when today is in service exceptions', function(){
            const anException = gtfs.exceptions.find(ex => ex.exception_type == 2)
            clock = sinon.useFakeTimers(moment.tz(anException.date, 'YYYYMMDD', config.TIMEZONE).valueOf())
            assert(gtfs.serviceExceptions())
        })
        it('Should respond false when today is not in service exceptions', function(){
            clock = sinon.useFakeTimers(100) // assumes start of epoch is not in service exceptions
            assert(!gtfs.serviceExceptions())
        })
    })
    describe('Get GTFS zip file', function(){
        let execStub, logstub
        beforeEach(function() {
            execStub = sinon.stub(child_pr, 'exec')
            logstub = sinon.stub(logger, 'error')
        })
        afterEach(function(){
            execStub.restore()
            logstub.restore()
        })

        it('should resovle true when curl returns 304 status', function(){
            execStub.yields(null, "304", null)
            return gtfs.getGTFSFile()
            .then(assert.ok)
        })
        it('should reject with error and log it when curl returns status other than 304 or 200', function(){
            const errCode = "401"
            execStub.yields(null, errCode, null)
            return gtfs.getGTFSFile()
            .then(
                resp => {throw new Error("Promise should not be fulfilled when error status is returned")},
                err => sinon.assert.calledWith(logstub, `Muni Server responded with code ${errCode} when downloading gtfs file` )
            )
        })
        it('should reject and log on error', function(){
            const err = "Some Error"
            execStub.yields(err, "401", null)
            return gtfs.getGTFSFile()
            .then(
                resp => {throw new Error("Promise should not be fulfilled when error status is returned")},
                err => sinon.assert.calledWith(logstub, err )
            )
        })
        it('should call exec to unzip file on succesful download', function(){
            execStub.onCall(0).yields(null, "200", null) // curl
            execStub.onCall(1).yields(null) // unzip
            return gtfs.getGTFSFile()
            .then(assert.ok)
        })
        it('should reject and log error if unzip fails', function(){
            const err = "Some unzip error"
            execStub.onCall(0).yields(null, "200", null)
            execStub.onCall(1).yields(err)
            return gtfs.getGTFSFile()
            .then(
                resp => {throw new Error("Promise should not be fulfilled when error status is returned")},
                err => sinon.assert.calledWith(logstub, err )
            )
        })
    })
})