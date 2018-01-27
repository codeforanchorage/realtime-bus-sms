'use strict';

const assert    = require('assert')
const sinon     = require('sinon')
const steno     = require('steno')
const request   = require('request')
const config    = require('../lib/config')
const feedback  = require('../lib/feedback')
const comments  = require('./fixtures/fake_comments.json')
const logger    = require('../lib/logger')
const twilioClient = feedback.twilioClient


describe("User Feedback", function(){
    describe("feedbackResponder_web", function(){
        let req, res, logStub, postStub, commentStub, formStub
        let comment = "Fake Testing Comment"
        beforeEach(function(){
            req = {
                body: {comment: comment, email: "test@example.com"},
                connection: {remoteAddress: "192.168.10.2"},
                protocol: 'http',
                get() {return "example.com"}
            }
            res = {render: sinon.stub(), locals: {}, send: sinon.stub(), set: sinon.stub()}
            logStub = sinon.stub(logger, 'error')
            commentStub = sinon.stub(steno, 'writeFile') //lowDB uses steno to write files
            formStub = sinon.stub()
            postStub = sinon.stub(request, 'post').returns({form: formStub})
        })
        afterEach(function(){
            logStub.restore()
            commentStub.restore()
            postStub.restore()
        })

        it("Should set returnHTML flag", function(){
            feedback.feedbackResponder_web(req, res)
            assert.equal(res.locals.returnHTML, 1)
        })
        it('Should set actions to "feedback"', function(){
            feedback.feedbackResponder_web(req, res)
            assert.equal(res.locals.action, "Feedback")
        })
        it('Should render message template with message', function(){
            commentStub.yields()
            return feedback.feedbackResponder_web(req, res)
            .then(() => sinon.assert.calledWith(res.render, 'message', {message: {message:'Thanks for the feedback'}}))
       })
       it('Should send a message to the user if there is an error', function(){
            commentStub.yields(new Error("Write Error"))
            return feedback.feedbackResponder_web(req, res)
            .then(() => sinon.assert.calledWith(res.render, 'message', {message: {message:'Error saving feedback, administrator notified'}}))
       })
       it('Should log an error when the feedback fails', function(){
            const feedbackError = new Error("Feedback Problem")
            commentStub.yields(feedbackError)
            return feedback.feedbackResponder_web(req, res)
            .then(() => sinon.assert.calledWith(logStub, feedbackError))
        })
        it("Should post to Slack webhook", function(){
            var slackwebhook = config.SLACK_WEBHOOK
            config.SLACK_WEBHOOK = "https://slackhook.example.com"
            commentStub.yields()
            return feedback.feedbackResponder_web(req, res)
            .then(() => {
                sinon.assert.calledWith(postStub, config.SLACK_WEBHOOK)
                config.SLACK_WEBHOOK = slackwebhook
            })
        })
        it("Slack webhook payload should include message and phone", function(){
            var slackwebhook = config.SLACK_WEBHOOK
            config.SLACK_WEBHOOK = "https://slackhook.example.com"
            commentStub.yields()
            return feedback.feedbackResponder_web(req, res)
            .then(() => {
                let text = formStub.args[0][0] &&  formStub.args[0][0]
                text = JSON.parse(text).text
                assert(new RegExp(req.body.email).test(text))
                assert(new RegExp(comment).test(text))
                config.SLACK_WEBHOOK = slackwebhook
            })
        })

        describe("Saves comments to LowBD", function(){
            beforeEach(() => commentStub.yields())

            it("Should save the feedback", function(){
                req.body.comment =  "A test comment" + Date.now().toString(36)
                feedback.feedbackResponder_web(req, res)
                let all_comments = JSON.parse(commentStub.args[0][1]).comments
                let the_comment =  all_comments[all_comments.length -1]

                assert.equal(the_comment.feedback, req.body.comment )
            })
            it("Should save the ip address", function(){
                req.connection.remoteAddress =   "192." +  Date.now().toString(10)
                feedback.feedbackResponder_web(req, res)
                let all_comments = JSON.parse(commentStub.args[0][1]).comments
                let the_comment =  all_comments[all_comments.length -1]

                assert.equal(the_comment.ip, req.connection.remoteAddress )
            })
            it("Should save the email address", function(){
                req.body.email =  "user@" + Date.now().toString(36) + ".com"
                feedback.feedbackResponder_web(req, res)
                let all_comments = JSON.parse(commentStub.args[0][1]).comments
                let the_comment =  all_comments[all_comments.length -1]

                assert.equal(the_comment.email, req.body.email )
            })
            it("Should save a hash", function(){
                feedback.feedbackResponder_web(req, res)
                let all_comments = JSON.parse(commentStub.args[0][1]).comments
                let the_comment =  all_comments[all_comments.length -1]

                assert(the_comment.response_hash.length == 40 )
            })
            it("Should save the correct date", function(){
                let clock = sinon.useFakeTimers(40035600000)
                feedback.feedbackResponder_web(req, res)
                let all_comments = JSON.parse(commentStub.args[0][1]).comments
                let the_comment =  all_comments[all_comments.length -1]
                clock.restore()
                assert.equal(the_comment.date, '1971-04-09 09:00:00')
            })
        })
    })

    describe("feedbackResponder_sms", function(){
        let req, res, next, logStub, commentStub, postStub, formStub
        let comment = "A feedback comment"
        beforeEach(function(){
            req = {
                body: {Body: config.FEEDBACK_TRIGGER + comment, From: '9075551111'},
                connection: {remoteAddress: "192.168.10.2"},
                protocol: 'http',
                get() {return "example.com"}
            }
            res = {render: sinon.stub(), locals: {}, send: sinon.stub(), set: sinon.stub()}
            next = sinon.stub()
            logStub = sinon.stub(logger, 'error') // this just keeps the test errors off the console
            commentStub = sinon.stub(steno, 'writeFile')
            formStub = sinon.stub()
            postStub = sinon.stub(request, 'post').returns({form: formStub})
        })
        afterEach(function(){
            logStub.restore()
            commentStub.restore()
            postStub.restore()
        })
        it('Should only respond with the feedback trigger word', function(){
            commentStub.yields()
            req = {body: {Body: "A comment"}}
            feedback.feedbackResponder_sms(req, res, next)
            sinon.assert.called(next)
            sinon.assert.notCalled(res.send)
            sinon.assert.notCalled(res.set)
        })
        it("Should set content type to plain/text", function(){
            commentStub.yields()
            feedback.feedbackResponder_sms(req, res, next)
            sinon.assert.calledWith(res.set, 'Content-Type', 'text/plain')
        })
        it("Should not crash when body is not a string", function(){
            commentStub.yields()
            req = {body: {Body: 1}}
            feedback.feedbackResponder_sms(req, res, next)
        })
        it("Should set res.locals.action to 'Feedback'", function(){
            commentStub.yields()
            feedback.feedbackResponder_sms(req, res, next)
            assert.equal(res.locals.action, "Feedback")
        })
        it("Should send a response", function(){
            commentStub.yields()
            return feedback.feedbackResponder_sms(req, res, next)
            .then(() => sinon.assert.calledWith(res.send, "Thanks for the feedback"))
        })
        it("Feedback trigger should be case insensitive ", function(){
            let trigger = config.FEEDBACK_TRIGGER.split('').map(char => Math.random() > .5 ? char.toUpperCase() : char).join('')
            req.body.Body = trigger + "a comment"
            commentStub.yields()
            feedback.feedbackResponder_sms(req, res, next)
            .then(()=> sinon.assert.calledWith(res.send, "Thanks for the feedback"))
        })
        it("Should send a response on failure", function(){
            commentStub.yields(new Error("Feedback write error"))
            return feedback.feedbackResponder_sms(req, res, next)
            .then(() => sinon.assert.calledWith(res.send, "Error saving feedback, administrator notified."))
        })
        it("Should log an error on failure", function(){
            const error = new Error("Feedback Error")
            commentStub.yields(error)
            return feedback.feedbackResponder_sms(req, res, next)
            .then(() => sinon.assert.calledWith(logStub, error))
        })
        it("Should post to Slack webhook", function(){
            var slackwebhook = config.SLACK_WEBHOOK
            config.SLACK_WEBHOOK = "https://slackhook.example.com"
            commentStub.yields()
            return feedback.feedbackResponder_sms(req, res, next)
            .then(() => {
                sinon.assert.calledWith(postStub, config.SLACK_WEBHOOK)
                config.SLACK_WEBHOOK = slackwebhook
            })
        })
        it("Slack webhook payload should include message and phone", function(){
            var slackwebhook = config.SLACK_WEBHOOK
            config.SLACK_WEBHOOK = "https://slackhook.example.com"
            commentStub.yields()
            return feedback.feedbackResponder_sms(req, res, next)
            .then(() => {
                let text = formStub.args[0][0] &&  formStub.args[0][0]
                text = JSON.parse(text).text
                assert(new RegExp(req.body.From).test(text))
                assert(new RegExp(comment).test(text))
                config.SLACK_WEBHOOK = slackwebhook
            })
        })
        describe('Saving comments to LowDB', function(){
            beforeEach(() => commentStub.yields())

            it("Should save feedback without the trigger word ", function(){
                let comment = "Test Comment: " + Date.now().toString(36)
                req.body.Body =  config.FEEDBACK_TRIGGER + comment
                feedback.feedbackResponder_sms(req, res, next)
                let all_comments = JSON.parse(commentStub.args[0][1]).comments
                let the_comment =  all_comments[all_comments.length -1]
                assert.equal(the_comment.feedback, comment)
            })
            it("Should save the phone number", function(){
                req.body.From =  Date.now().toString(10).slice(2),
                feedback.feedbackResponder_sms(req, res)
                let all_comments = JSON.parse(commentStub.args[0][1]).comments
                let the_comment =  all_comments[all_comments.length -1]
                assert.equal(the_comment.phone, req.body.From)
            })

            it("Should save the Facebook user when from Facebook", function(){
                req.body.isFB = true;
                req.body.From =  "FB User: " + Date.now().toString(36)
                feedback.feedbackResponder_sms(req, res, next)
                let all_comments = JSON.parse(commentStub.args[0][1]).comments
                let the_comment =  all_comments[all_comments.length -1]
                assert.equal(the_comment.fbUser, req.body.From)
            })
            it("Should not save a phone number when from Facebook", function(){
                req.body.isFB = true;
                req.body.From =  "FB User: " + Date.now().toString(36)
                feedback.feedbackResponder_sms(req, res)
                let all_comments = JSON.parse(commentStub.args[0][1]).comments
                let the_comment =  all_comments[all_comments.length -1]
                assert.equal(the_comment.phone, undefined)
            })

        })
    })

    describe("feedback_response_get_form", function(){
        let  comment, res, jsonStub
        const next = sinon.stub()

        beforeEach(function(){
            res = {render: sinon.stub(), sendStatus: sinon.stub()}
            jsonStub = sinon.stub(JSON, 'parse').returns(comments)
        })
        afterEach(function(){
           // feedbackStub.restore()
            jsonStub.restore()
        })

        it('Should respond with the correct comment found from given hash', function(){
            const expected_obj = {
                    pageData: {
                        feedback: 'Findme',
                        hash: "7d93f9a99c766418a33e5f334ad973a3e1da4494",
                        phone: '9078548077'
                  }}
            const req = {query:{hash: expected_obj.pageData.hash}}
            feedback.feedback_get_form(req, res, next)
            sinon.assert.calledWith(res.render, 'respond', expected_obj)
        })
        it('Should return 404 if comment is not found', function(){
            let req = {query: {hash: "0093f9a99c766418jk4e5f334ad973a3e1da1234"}}
            feedback.feedback_get_form(req, res, next)
            sinon.assert.notCalled(res.render)
            sinon.assert.calledWith(res.sendStatus, 404)
        })
        it('Should return 404 for found comments without phone', function(){
            const req = {query: {hash: "7d6a9ecc52f3e9bd86868a878fbd4chfa06dd822"}}
            feedback.feedback_get_form(req, res, next)
            sinon.assert.notCalled(res.render)
            sinon.assert.calledWith(res.sendStatus, 404)
        })
    })

    describe("send_feedback_response", function(){
        let  comment, res, jsonStub, twilioStub, expected_obj, next, loggerStub
        beforeEach(function(){
            loggerStub = sinon.stub(logger, 'error')
            next = sinon.stub()
            res = {render: sinon.stub()}
            twilioStub = sinon.stub(twilioClient.messages, 'create')
            jsonStub = sinon.stub(JSON, 'parse').returns(comments)
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
            const response = "Some random response"
            const req = {body:{hash: expected_obj.pageData.hash, response:response}}
            feedback.send_feedback_response(req, res, next)
            sinon.assert.calledWith(twilioStub, {
                to: expected_obj.pageData.phone,
                from: config.MY_PHONE,
                body: response
            })
        })
        it("Should respond with a message if the comment was not found", function(){
            const response = "Some random response"
            const req = {body:{hash: '000', response:response}}
            feedback.send_feedback_response(req, res, next)
            sinon.assert.calledWith(res.render, "message", {message: {message:'Error: The original comment was not found!?!'}})
        })
        it('Should send a response back with correct number after posting Twilio message', function(){
            twilioStub.yieldsAsync(null, "success")
            const response = "Some random response"
            const req = {body: {hash: expected_obj.pageData.hash, response: response}}
            const entry = {response: response, to_phone: expected_obj.pageData.phone}
            feedback.send_feedback_response(req, res, next)
            setImmediate(() => sinon.assert.calledWith(res.render, "response", {pageData: {err: null, entry: entry}}))
        })
        it('Should render a response with the error if twilio fails', function(){
            const err = new Error("Twilio Error")
            twilioStub.yieldsAsync(err, null)
            const req = {body: {hash: expected_obj.pageData.hash, response: "response"}}
            feedback.send_feedback_response(req, res, next)
            setImmediate(() => sinon.assert.calledWith(res.render, "response", {pageData: {err: err}}))
        })
        it('Should log an error if twilio fails', function(){
            const err = new Error("Twilio Error")
            twilioStub.yieldsAsync(err, null)
            const req = {body: {hash: expected_obj.pageData.hash, response: "response"}}
            feedback.send_feedback_response(req, res, next)
            setImmediate(() => sinon.assert.calledWith(loggerStub, err))
        })
    })

})