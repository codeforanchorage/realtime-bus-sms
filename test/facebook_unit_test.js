"use.strict";

const fb      = require('../lib/facebook')
const crypto  = require('crypto')
const sinon   = require('sinon')
const assert  = require('assert')
const request = require('request')
const logger  = require('../lib/logger')
const config  = require('../lib/config')

describe("Facebook Functions", function(){
    describe("facebook_verify", function(){
        const fbToken       = "someRandomFBToken"
            , fbChallenge   = "aFBChallengeString"
            , sendStub      = sinon.stub()
            , statusStub    = sinon.stub().returns({send:sendStub})
            , res           = {sendStatus: sinon.stub(), status: statusStub}
            , originalToken = config.FB_VALIDATION_TOKEN

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
            fb.verify(req, res)
            sinon.assert.calledWith(res.status, 200)
        })
        it("Should respond with FB challenge string", function(){
            fb.verify(req, res)
            sinon.assert.calledWith(sendStub, fbChallenge)
        })
        it("Should send a 403 status when when tokens don't match", function(){
            fbRequest['hub.verify_token'] = "noGood"
            fb.verify(req, res)
            sinon.assert.calledWith(res.sendStatus, 403)
        })
        it("Should send a 403 status for modes other than subscribe", function(){
            fbRequest['hub.mode'] = "ShowMeTheLove"
            fb.verify(req, res)
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
                fb.update(req,res)
                sinon.assert.calledWith(res.sendStatus, 403)
        })
        it('Should pass an object with the data from each message back through the middleware', function(){
            fb.update(req,res)
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
            let sendFBStub = sinon.stub(fb, 'send')
            let newdata = {"foo": "bar"}
            req.runMiddleware.yields({}, newdata, {headers: "headers"})
            fb.update(req,res)
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

            fb.send(id, message)
            let sent = requestStub.args[0][0]
            assert.equal(sent.uri, facebook_api_uri)
            assert.deepEqual(sent.qs, {access_token: config.FB_PAGE_ACCESS_TOKEN})
            assert.equal(sent.json.recipient.id, id)
            assert.equal(sent.json.message.text, message)
        })
        it("Should log an error if facebook request fails", function(){
            let error = new Error("A Facebook Error")
            requestStub.yields(error)
            return fb.send('id', 'message')
            .then(() =>{ throw new Error("Promise should not be fulfilled when there is an error")},
                () => sinon.assert.calledWith(loggerStub, "Failed calling Send API: " + error.message))
        })
        it("Should log an error if facebook response code is not 200", function(){
            let bad_response = {statusCode: 404, statusMessage: "Not Found"}
            requestStub.yields(null, bad_response)
            return fb.send('id', 'message')
            .then(() => {throw new Error("Promise should not be fulfilled when there is an error")},
                ()=> sinon.assert.calledWith(loggerStub, "Failed calling Send API: " + bad_response.statusCode + " - " + bad_response.statusMessage))
        })
    })
    describe("Verify Facebook Signature", function(){
        let req, res, FB_APP_SECRET, buf, FB_secret
        beforeEach(function(){
            FB_secret = config.FB_APP_SECRET
            config.FB_APP_SECRET = "test_secret"
            req = {headers: {"x-hub-signature": "sha1=blahblah"}}
            buf = new Buffer("Some Test Text", "utf-8")
        })
        afterEach(function(){
            config.FB_APP_SECRET = FB_secret
        })
        it("Should not throw when hashes match", function(){
            let signature = crypto.createHmac('sha1', config.FB_APP_SECRET).update(buf).digest('hex')
            req = {headers: {"x-hub-signature": "sha1=" + signature}}
            assert.doesNotThrow(() => fb.verifyFBRequestSignature(req, res, buf))
        })
        it("Should throw when there is no signature", function(){
            req.headers = {}
            assert.throws(() => fb.verifyFBRequestSignature(req, res, buf))
        })
        it("Should throw when hashes don't match", function(){
            req = {headers: {"x-hub-signature": "sha1=" + "boing_boing"}}
            assert.throws(() => fb.verifyFBRequestSignature(req, res, buf))
        })

    })
})