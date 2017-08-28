'use strict';
/* steno is used by lowdb for writing the files
   These tests stub steno's  writeFile() call and inspects what and where it
   it writes
*/
const steno = require('steno'),
      sinon = require('sinon'),
      path = require('path'),
      assert= require('assert'),
      winston = require('winston'),
      hashwords = require('hashwords')(),
      config = require('../lib/config'),
      lowdb_log = require('../lib/lowdb_log_transport');

describe('LowDB Log Transport', function(){
    let logger, stenoStubb
    const metaObject = {
        input: "test input2",
        action: "test action2",
        phone: '9075555555',
        ip: '127.0.0.10',
        fbUser: "Facebook User"
    }
    before(function(){
        logger = new winston.Logger()
        logger.add(lowdb_log(), {})
    })

    beforeEach(function(){
        stenoStubb = sinon.stub(steno, 'writeFile')
    })
    afterEach(function(){
        stenoStubb.restore()
    })
    /* The signature for steno.writeFile is: writeFile('file.json', data, errCallback)
       This first call saves the private DB, the second saves the public db */

    it('Should save ip and phone to private db', function(){
        logger.info(metaObject)
        let saved = JSON.parse(stenoStubb.firstCall.args[1]).requests.pop()
        assert.equal(saved.phone, metaObject.phone)
        assert.equal(saved.ip, metaObject.ip)
    })
    it('Should save FB user to private db', function(){
        logger.info(metaObject)
        let saved = JSON.parse(stenoStubb.firstCall.args[1]).requests.pop()
        assert.equal(saved.fbUser, metaObject.fbUser)
    })
    it('Should save hashed FB user to public db', function(){
        logger.info(metaObject)
        let saved = JSON.parse(stenoStubb.secondCall.args[1]).requests.pop()
        assert.equal(saved.fbUser, hashwords.hashStr(metaObject.fbUser))
    })
    it('Should not save ip public db', function(){
        logger.info(metaObject)
        let saved = JSON.parse(stenoStubb.secondCall.args[1]).requests.pop()
        assert.strictEqual(saved.ip, undefined)
    })
    it('Should save hashed version of phone public db', function(){
        logger.info(metaObject)
        let saved = JSON.parse(stenoStubb.secondCall.args[1]).requests.pop()
        assert.equal(saved.phone, hashwords.hashStr(metaObject.phone))
    })
    it('Should save private db to correct file', function(){
        let private_db_file  = './db_private.json'
        logger.info(metaObject)
        let path = stenoStubb.firstCall.args[0]
        assert.equal(private_db_file, path)
    })
    it('Should save public db to correct file', function(){
        let public_db_file  = './public/db.json'
        logger.info(metaObject)
        let path = stenoStubb.secondCall.args[0]
        assert.equal(public_db_file, path)
    })
    it('Should save a timestampe of the current date', function(){
        let clock = sinon.useFakeTimers(1483228800000) // First milisecond of 2017
        logger.info(metaObject)
        let saved = JSON.parse(stenoStubb.secondCall.args[1]).requests.pop()
        assert.equal(saved.date, '2017-01-01T00:00:00.000Z')
        clock.restore()
    })
    it('Should not save log levels other than "info"', function(){
        logger.warn(metaObject)
        assert(stenoStubb.notCalled)
    })
    it('Should not save empty input', function(){
        logger.info({action: 'Empty Input'})
        assert(stenoStubb.notCalled)
    })
    it('Should not save feeback hits', function(){
        logger.info({action: 'Feedback'})
        assert(stenoStubb.notCalled)
    })
})

describe('Get Log Data', function(){
    // Most of these depends on having  entries of
    // the correct type and in the correct order in the fake_low_db

    let clock
    const fixturePath = path.resolve(__dirname, 'fixtures/fake_low_db.json')
    const fixtureFile = require(fixturePath)
    beforeEach(function(){
        clock = sinon.useFakeTimers(1503392400000)
    })
    afterEach(function(){
        clock.restore()
    })
    it('Should return only hits within given time frame', function(){
        let daysBack = 1
        let dateThen = new Date().setDate(new Date().getDate()-daysBack)
        let data = lowdb_log.getLogData(daysBack, 'hits',fixturePath )
        assert(data.every((entry) => entry.date * 1000 >= dateThen ))

        daysBack = 3
        dateThen = new Date().setDate(new Date().getDate()-daysBack)
        data = lowdb_log.getLogData(daysBack, 'hits',fixturePath )
        assert(data.every((entry) => entry.date * 1000 >= dateThen ))
    })
    it('Should return all hits within given time frame', function(){
        let daysBack = 1
        let data = lowdb_log.getLogData(daysBack, 'hits',fixturePath )
        assert(data.length == 5)

        daysBack = 2
        data = lowdb_log.getLogData(daysBack, 'hits',fixturePath )
        assert(data.length == 8)
    })
    it('Should set the correct type', function(){
        let daysBack = 0
        let dateThen = new Date().setDate(new Date().getDate()-daysBack)
        let data = lowdb_log.getLogData(daysBack, 'hits',fixturePath )
        assert.equal(data[0].type, 'sms')
        assert.equal(data[1].type, 'browser')
        assert.equal(data[2].type, 'fb')
    })
    it('Should set the correct userID', function(){
        let daysBack = 0
        let dateThen = new Date().setDate(new Date().getDate()-daysBack)
        let data = lowdb_log.getLogData(0, 'hits',fixturePath )
        assert.equal(data[0].userId, 'phone'+fixtureFile.requests[0].phone)
        assert.equal(data[1].userId, 'ip'+fixtureFile.requests[1].ip)
        assert.equal(data[2].userId, fixtureFile.requests[2].fbUser)
    })
    it('Returned objects should have the correct properties', function(){
        let properties = ['type', 'date', 'dateOffset', 'muniTime', 'totalTime', 'userId']
        let daysBack = 10
        let dateThen = new Date().setDate(new Date().getDate()-daysBack)
        let data = lowdb_log.getLogData(0, 'hits',fixturePath )
        assert(data.every(entry => properties.every(key => entry.hasOwnProperty(key))
        ))

    })
})