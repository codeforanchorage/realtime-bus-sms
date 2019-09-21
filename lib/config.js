module.exports = {
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || 'AC_fake_key_fallback',
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || 'fake_key_fallback',
    NEAREST_BUFFER: 1, // How far away should stops be found from locations. In miles.
    NEAREST_MAX: 5,    // Max number to find when finding stops by location
    FEEDBACK_TRIGGER: "Feedback:",
    SLACK_WEBHOOK: process.env.SLACK_WEBHOOK,
    GOOGLE_GEOCODE_LOCATION: "Anchorage, Alaska",
    GOOGLE_PLACES_KEY: process.env.GOOGLE_PLACES_KEY || 'fake_google_goecode_key',

    GEOCODE_URL_BASE: "https://maps.googleapis.com/maps/api/place/findplacefromtext/json?",

    TIMEZONE: "America/Anchorage",
    LOG_DAYS_BACK: 5,
    MY_PHONE: process.env.MY_PHONE || "+19073122060",
    GOOGLE_ANALYTICS_ID: process.env.GOOGLE_ANALYTICS_ID || 'fake_google_an_key', // Code for Anchorage tracking Code for bus app = "UA-56999250-2"

    ROLLBAR_TOKEN: process.env.ROLLBAR_TOKEN, // should be undefined in dev

    // Facebook Messenger Bot setup. See https://developers.facebook.com/docs/messenger-platform/guides/setup
    // Note that the "webhook" url here is /fbhook, not /webhook
    FB_VALIDATION_TOKEN: process.env.FB_VALIDATION_TOKEN || 'wtb_token',    // Your Facebook Page's verify token
    FB_PAGE_ACCESS_TOKEN: process.env.FB_PAGE_ACCESS_TOKEN,                 // Your Facebook Page's access token
    FB_APP_SECRET: process.env.FB_APP_SECRET,                                // Your Facebook App's secret.

    // To set up watson account see: https://www.ibm.com/watson/services/conversation/
    // The conversation bot configuration (watson-workspace.json) in this repo can be used
    // to create a copy of the app's watson bot
    WATSON_USER: process.env.WATSON_USER || 'fake_watson_user',
    WATSON_PASSWORD: process.env.WATSON_PASSWORD || 'fake_watson_password',
    WATSON_WORKPLACE_ID: process.env.WATSON_WORKPLACE_ID || 'fake_watson_workplace',

    // the bus tracker will not show incoming buses that are scheduled to arrive
    // after the current time. This setting allows a buffer of minutes to show 
    // buses that might be late. Set to 3, this will show buses scheduled to arrive
    // at 2:00 until 2:03.
    LATE_DELAY_TIME: 2
}
