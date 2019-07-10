'use strict';

/*
   steno is used by lowdb for writing the files
   These tests stub steno's writeFile()
   The signature for steno.writeFile is: writeFile(filename, data, errCallback)
*/
const steno     = require('steno')
const sinon     = require('sinon')
const path      = require('path')
const assert    = require('assert')
const winston   = require('winston')
const hashwords = require('hashwords')()
const config    = require('../lib/config')
const lowdb_log = require('../lib/lowdb_log_transport')
const FileASync = require('lowdb/adapters/FileAsync')

describe('LowDB Log Transport', function(){
    let logger, lowdbStub
    const metaObject =
        {
            input: "test input2",
            action: "test action2",
            phone: '9075555555',
            ip: '127.0.0.10',
            fbUser: "Facebook User"
        }
    

    beforeEach(function(){
        logger = new winston.Logger()
        logger.add(lowdb_log(), {})
        lowdbStub = sinon.stub(FileASync.prototype, 'write')
    })
    afterEach(function(){
        lowdbStub.restore()
    })

    it('Should save ip and phone to private db', function(done){
        logger.on('logging', () => {
            console.log("log ")
            try {
                let saved = lowdbStub.firstCall.args[0].requests.pop()
                assert.equal(saved.phone, metaObject.phone)
                assert.equal(saved.ip, metaObject.ip)    
                done()
            } catch(e){
                done(e)
            }
        })
        logger.info(metaObject)
    })
    it('Should save FB user to private db', function(done){
        logger.on('logging', () => {
            try{
                let saved = lowdbStub.firstCall.args[0].requests.pop()
                assert.equal(saved.fbUser, metaObject.fbUser)
                done()
            } catch (e) {
                done(e)
            }
        })
        logger.info(metaObject)
    })
    it('Should save hashed FB user to public db', function(done){
        logger.on('logging', () => {     
            try{
                let saved = lowdbStub.secondCall.args[0].requests.pop()
                assert.equal(saved.fbUser, hashwords.hashStr(metaObject.fbUser))
                done()
            } catch (e) {
                done(e)
            }
        })
        logger.info(metaObject)
    })
    it('Should not save ip public db', function(done){
        logger.on('logging', () => {
            try{
                let saved = lowdbStub.secondCall.args[0].requests.pop()
                assert.strictEqual(saved.ip, undefined)
                done()
            } catch(e) {
                done(e)
            }
        })
        logger.info(metaObject)
    })
    it('Should save hashed version of phone public db', function(done){
        logger.on('logging', () => {
            try{
                let saved = lowdbStub.secondCall.args[0].requests.pop()
                assert.equal(saved.phone, hashwords.hashStr(metaObject.phone))
                done()
            } catch(e) {
                done(e)
            }
        })
        logger.info(metaObject)
    })
    it('Should save a timestampe of the current date', function(done){
        let clock = sinon.useFakeTimers(1483228800000) // First milisecond of 2017
        logger.on('logging', () => {
            try{
                let saved = lowdbStub.secondCall.args[0].requests.pop()
                assert.equal(saved.date.toISOString(), '2017-01-01T00:00:00.000Z')
                clock.restore()
                done()
            } catch (e) {
                clock.restore()
                done(e)
            }          
        })
        logger.info(metaObject)
    })
    it('Should not save log levels other than "info"', function(done){
        logger.on('logging', () => {
            try {
                assert(lowdbStub.notCalled)
                done()
            } catch(e) {
                done(e)
            }
        })
        logger.warn(metaObject)
        
    })
    it('Should not save empty input', function(done){
        logger.on('logging', () => {
            try {
                assert(lowdbStub.notCalled)
                done()
            } catch(e) {
                done(e)
            }
        })        
        logger.info({action: 'Empty Input'})
    })
    it('Should not save feeback hits', function(done){
        logger.on('logging', () => {
            try {
                assert(lowdbStub.notCalled)
                done()
            } catch(e) {
                done(e)
            }
        })
        logger.info({action: 'Feedback'})
    })
})

describe('Get Log Data', function(){
    let clock
    const fixturePath = path.resolve(__dirname, 'fixtures/fake_low_db.json')
    const fixtureFile = require(fixturePath)
    beforeEach(function(){
        clock = sinon.useFakeTimers(1503392400000)
    })
    afterEach(function(){
        clock.restore()
    })
    it('Should return only hits within given time frame', async function(){
        let daysBack = 1
        let dateThen = new Date().setDate(new Date().getDate()-daysBack)
        let data = await lowdb_log.getLogData(daysBack, 'hits',fixturePath )
        assert(data.every((entry) => entry.date * 1000 >= dateThen ))

        daysBack = 3
        dateThen = new Date().setDate(new Date().getDate()-daysBack)
        data = await lowdb_log.getLogData(daysBack, 'hits',fixturePath )
        assert(data.every((entry) => entry.date * 1000 >= dateThen ))
    })
    it('Should return all hits within given time frame', async function(){
        let daysBack = 1
        let data = await lowdb_log.getLogData(daysBack, 'hits',fixturePath )
        assert(data.length == 5)

        daysBack = 2
        data = await lowdb_log.getLogData(daysBack, 'hits',fixturePath )
        assert(data.length == 8)
    })
    it('Should set the correct type', async function(){
        let daysBack = 0
        let data = await lowdb_log.getLogData(daysBack, 'hits',fixturePath )
        assert.equal(data[2].type, 'sms')
        assert.equal(data[1].type, 'browser')
        assert.equal(data[0].type, 'fb')
    })
    it('Should set the correct userID', async function(){
        let data = await lowdb_log.getLogData(0, 'hits',fixturePath )
        let records = fixtureFile.requests.length
        assert.equal(data[2].userId, 'phone'+fixtureFile.requests[records - 3].phone)
        assert.equal(data[1].userId, 'ip'+fixtureFile.requests[records - 2].ip)
        assert.equal(data[0].userId, fixtureFile.requests[records -1 ].fbUser)
    })
    it('Returned objects should have the correct properties', async function(){
        let properties = ['type', 'date', 'dateOffset', 'muniTime', 'totalTime', 'userId']
        let data = await lowdb_log.getLogData(0, 'hits',fixturePath )
        assert(data.every(entry => properties.every(key => entry.hasOwnProperty(key))
        ))
    })
})