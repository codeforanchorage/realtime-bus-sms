module.exports = {
    TWILIO_ACCOUNT_SID: '<secret>',
    TWILIO_AUTH_TOKEN: '<secret>',
    NEAREST_BUFFER: 1,
    NEAREST_MAX: 5,
    FEEDBACK_TRIGGER: "Feedback:",
    FEEDBACK_EMAIL_TO: process.env.FEEDBACK_EMAIL_TO || 'bus_feedback@codeforanchorage.org',
    FEEDBACK_EMAIL_FROM: process.env.FEEDBACK_EMAIL_FROM || 'no-reply@codeforanchorage.org',
    GMAIL_USERNAME: process.env.GMAIL_USERNAME,
    GMAIL_PASSWORD: process.env.GMAIL_PASSWORD,
    TIMEZONE: "America/Anchorage",
    MUNI_URL: process.env.MUNI_URL || "http://bustracker.muni.org/InfoPoint/departures.aspx?stopid=",
    LOG_DAYS_BACK: 5
}
