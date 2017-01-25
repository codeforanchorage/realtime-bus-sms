module.exports = {
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || 'fake_key_fallback',
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || 'fake_key_fallback',
    NEAREST_BUFFER: 1,
    NEAREST_MAX: 5,
    FEEDBACK_TRIGGER: "Feedback:",
    FEEDBACK_EMAIL_TO: process.env.FEEDBACK_EMAIL_TO || 'bus_feedback@codeforanchorage.org',
    FEEDBACK_EMAIL_FROM: process.env.FEEDBACK_EMAIL_FROM || 'no-reply@codeforanchorage.org',
    GMAIL_USERNAME: process.env.GMAIL_USERNAME,
    GMAIL_PASSWORD: process.env.GMAIL_PASSWORD,
    SLACK_WEBHOOK: process.env.SLACK_WEBHOOK,
    GOOGLE_GEOCODE_LOCATION: "Anchorage",

    TIMEZONE: "America/Anchorage",
    MUNI_URL: process.env.MUNI_URL || "http://bustracker.muni.org/InfoPoint/departures.aspx?stopid=",
    LOG_DAYS_BACK: 5,
    MY_PHONE: process.env.MY_PHONE || "+19073122060",
    GOOGLE_ANALYTICS_ID: process.env.GOOGLE_ANALYTICS_ID, // Code for Anchorage tracking Code for bus app = "UA-56999250-2"

    ROLLBAR_TOKEN: process.env.ROLLBAR_TOKEN, // should be undefined in dev


    // Facebook Messenger Bot setup. See https://developers.facebook.com/docs/messenger-platform/guides/setup
    // Note that the "webhook" url here is /fbhook, not /webhook
    FB_VALIDATION_TOKEN: process.env.FB_VALIDATION_TOKEN || 'wtb_token',    // Your Facebook Page's verify token
    FB_PAGE_ACCESS_TOKEN: process.env.FB_PAGE_ACCESS_TOKEN,                 // Your Facebook Page's access token
    FB_APP_SECRET: process.env.FB_APP_SECRET,                                // Your Facebook App's secret.

    WATSON_USER: process.env.WATSON_USER,
    WATSON_PASSWORD: process.env.WATSON_PASSWORD,
    WATSON_WORKPLACE: process.env.WATSON_WORKPLACE_ID

}

