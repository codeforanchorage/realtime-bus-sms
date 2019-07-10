'use strict';

const config = require('./config')
const crypto = require('crypto')
const fs = require('fs')
const low = require('lowdb')
const FileASync = require('lowdb/adapters/FileAsync')

const request = require('request')
const logger = require('./logger')
const twilioClient = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
const comments = low('./comments.json', { storage: require('lowdb/lib/storages/file-async') });

/**
 *  Functions to process feedback from users
 *  @module lib/feedback
 */

/**
 * Middleware to process feedback from HTML form
 * @param {*} req
 * @param {*} res
 */
function feedbackResponder_web(req, res) {
    res.locals.returnHTML = 1
    res.locals.action = 'Feedback'
    return module.exports.processFeedback(req.body.comment || '', req)
        .then(() => res.render('message', {message: {message:'Thanks for the feedback'}}))
        .catch((err)=>{
            res.render('message', {message: {message:'Error saving feedback, administrator notified'}})
            logger.error(err)
        });
}

/**
 * Middleware to process feedback from SMS
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function feedbackResponder_sms(req, res, next){
    var message = String(req.body.Body) || '';
    if (message.substring(0, config.FEEDBACK_TRIGGER.length).toUpperCase() == config.FEEDBACK_TRIGGER.toUpperCase()) {
        res.set('Content-Type', 'text/plain');
        res.locals.action = 'Feedback'
        req.body.comment = message.substring(config.FEEDBACK_TRIGGER.length)
        return module.exports.processFeedback(message.substring(config.FEEDBACK_TRIGGER.length), req)
            .then((data)=>res.send("Thanks for the feedback"))
            .catch((err)=>{
                res.send("Error saving feedback, administrator notified.");
                logger.error(err)
            });
    }
    next();
}


/**
 * Creates an html form that allows admin to respond to feedback
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function feedback_get_form(req, res, next) {
    var comments = JSON.parse(fs.readFileSync('./comments.json'));
    for(var i=comments.comments.length-1; i >= 0; i--) {
        if (comments.comments[i].response_hash && (comments.comments[i].response_hash == req.query.hash)) {
            if (comments.comments[i].phone) {
                return res.render("respond", {pageData: {hash: comments.comments[i].response_hash, feedback: comments.comments[i].feedback, phone: comments.comments[i].phone}});
            }
        }
    }
    res.sendStatus(404);
}


/**
 * Post feedback from the form created by feedback_get_form()
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function send_feedback_response(req, res, next) {
    var comments = JSON.parse(fs.readFileSync('./comments.json'));
    var foundIt = false;
    for(let i=comments.comments.length-1; i >= 0 && !foundIt; i--) {
        if (comments.comments[i].response_hash && (comments.comments[i].response_hash == req.body.hash)) {
            if (comments.comments[i].phone) {

                foundIt = true;
                if (req.body.response) {
                    twilioClient.messages.create({
                            to: comments.comments[i].phone,
                            from: config.MY_PHONE,
                            body: req.body.response }, function(err, message) {
                            if (!err) {
                                var entry = {
                                    response: req.body.response,
                                    to_phone: comments.comments[i].phone
                                };
                                res.render("response", {pageData: {err: null, entry: entry}});
                            } else {
                                logger.error(err)
                                res.render("response", {pageData: {err: err}});
                            }
                        }
                    );
                }
            }
        }
    }
    if (!foundIt) res.render("message", {message: {message:'Error: The original comment was not found!?!'}});
}

/**
 *  Helper Function to save the feedback
 * @param {string} feedback
 * @param {*} req
 */
function processFeedback(feedback, req) {
    var response_hash = crypto.randomBytes(20).toString('hex');

    var payload = {text: `Feedback: ${feedback}
                 Phone: ${req.body.From}
                 Email: ${req.body.email}
          ${req.body.From ? `Go to  ${req.protocol}://${req.get('host')}/respond?hash=${response_hash} to respond` : ""}`};

    // post to slack if it's configured
    if (config.SLACK_WEBHOOK) {
        request.post(config.SLACK_WEBHOOK).form(JSON.stringify(payload));
    }

    feedback = feedback.trim();

    return comments.defaults({ comments: []})
        .get('comments').push({
            date: (new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')),
            feedback: feedback,
            phone: req.body.isFB ? undefined : req.body.From,
            fbUser: req.body.isFB ? req.body.From : undefined,
            email: req.body.email,
            ip: req.connection.remoteAddress,
            response_hash: response_hash
        })
        .write()

}

module.exports = {
    feedbackResponder_sms:feedbackResponder_sms,
    feedbackResponder_web:feedbackResponder_web,
    feedback_get_form:feedback_get_form,
    send_feedback_response: send_feedback_response,
    processFeedback: processFeedback,
    twilioClient: twilioClient // it's a little hacky to export, but it makes it possible to stub twilio for tests
}
