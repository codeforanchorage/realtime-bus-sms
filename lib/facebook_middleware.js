var request = require('request');
var https = require('https');

/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyFBRequestSignature(req, res, buf) {
    var signature = req.headers["x-hub-signature"];

    if (!signature) {
        // For testing, let's log an error. In production, you should throw an
        // error.
        console.log("Don't have a signature");
        throw new Error("Couldn't validate the signature.");
    } else {
        var elements = signature.split('=');
        var method = elements[0];
        var signatureHash = elements[1];

        var expectedHash = crypto.createHmac('sha1', config.FB_APP_SECRET)
            .update(buf)
            .digest('hex');
        console.log("Signature: ",signatureHash, " Expected: ", expectedHash);
        if (signatureHash != expectedHash) {
            throw new Error("Couldn't validate the request signature.");
        }
    }
}

function verify(req, res){
    if (req.query['hub.mode'] === 'subscribe' &&
        req.query['hub.verify_token'] === config.FB_VALIDATION_TOKEN) {
        logger.info("Validating webhook");
        res.status(200).send(req.query['hub.challenge']);
    } else {
        logger.warn("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
}

function update(req, res){
    var data = req.body;

    // Make sure this is a page subscription
    if (data.object == 'page') {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function(pageEntry) {
            var pageID = pageEntry.id;
            var timeOfEvent = pageEntry.time;
            console.log("messaging: ", pageEntry.messaging)
            // Iterate over each messaging event
            pageEntry.messaging.forEach(function(messagingEvent) {
                if (messagingEvent.message) {
                    //var reqClone = Object.assign({}, req);  // Need copies for each handled message
                    //var resClone = Object.assign({}, res);
                    //receivedFBMessage(req, res, messagingEvent);
                    req.runMiddleware('/', {
                        method:'post',
                        body: {Body: messagingEvent.message.text,
                                From: messagingEvent.sender.id,
                                isFB: true}
                    },function(code, data, headers){
                        //data has response from express
                        sendFBMessage(messagingEvent.sender.id, data)
                    })
                } else {
                    logger.warn("fbhook received unknown messagingEvent: ", JSON.stringify(messagingEvent));
                }
            });
        })
         // Assume all went well.
        //
        // You must send back a 200, within 20 seconds, to let us know you've
        // successfully received the callback. Otherwise, the request will time out.
        res.sendStatus(200);
    }
}

function sendFBMessage(recipientId, messageText) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: messageText,
            metadata: "DEVELOPER_DEFINED_METADATA"
        }
    };
    //console.log("Trying to send message \"%s\" to recipient %s", messageText, recipientId );

    request({
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: { access_token: config.FB_PAGE_ACCESS_TOKEN },
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        if (error || (response.statusCode != 200)) {
            if (error) {
                logger.error("Failed calling Send API: " + error.message);
            }
            if (response) {
                logger.error("Failed calling Send API: " + response.statusCode + " - " + response.statusMessage);
            }
        }
    });

}
module.exports.verify = verify;
module.exports.update = update;
module.exports.verifyFBRequestSignature = verifyFBRequestSignature;
