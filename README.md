realtime-bus-sms
================

Text back current arrival time for buses given a texted in bus stop number for People Mover

A stub for work combining Bustracker.muni.org, Wheels on the Bus scraping, Twilio, and translation from People Mover bus stop id to Bustracker bus stop id.

To run it: **node bin/www**

By default, this will serve on http://127.0.0.1:8080


For Developers
===================
There are several bus users and scenarios in which they would use the bus.

What exists
- GTFS is in Goole Maps and Bing which allows route planning and locations of stops.
- GTFS is being used by the [Moovit](http://www.moovitapp.com/) smartphone app.
- [Bustracker.muni.org](http://bustracker.muni.org) is a good desktop web interface for showing realtime ETA and locations of buses. This app is hard to view and use on a smartphone screen.
- A text based version of Bustracker. You choose the route and then scroll for the stop name and then select to see the bus ETAs. Good if you know the bus stop name. This project is leveraging the text bustracker interface.

 

