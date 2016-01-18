realtime-bus-sms
================

[![Build Status](https://travis-ci.org/codeforanchorage/realtime-bus-sms.svg?branch=master)](https://travis-ci.org/codeforanchorage/realtime-bus-sms) 


Text back current arrival time for buses given a texted in bus stop number for People Mover

A stub for work combining Bustracker.muni.org, Wheels on the Bus scraping, Twilio, and translation from People Mover bus stop id to Bustracker bus stop id.


For Developers
===================
There are several bus users and scenarios in which they would use the bus.

What exists
- GTFS is in Goole Maps and Bing which allows route planning and locations of stops.
- GTFS is being used by the [Moovit](http://www.moovitapp.com/) smartphone app.
- [Bustracker.muni.org](http://bustracker.muni.org) is a good desktop web interface for showing realtime ETA and locations of buses. This app is hard to view and use on a smartphone screen.
- A text based version of Bustracker. You choose the route and then scroll for the stop name and then select to see the bus ETAs. Good if you know the bus stop name. This project is leveraging the text bustracker interface.

Contributing
------------

1. Fork the repo and work on your changes
1. Create a pull request to the **dev** branch (or your own feature branch)

Project Setup
--------------
Vagrant:

    # create vagrant vm
    vagrant up

    # get onto vagrant vm
    vagrant ssh

    # install deps
    cd realtime-bus-sms
    npm install

    # run 
    # By default, this will serve on http://192.168.51.10:8080
    ./bin/www

    # run tests
    sudo npm install -g nodeunit   # install testing framework
    npm test


Linux:

    # install nodejs/npm
    # (note: the legacy package makes sure /usr/bin/node links to nodejs and not something else)
    sudo apt-get install npm nodejs nodejs-legacy

    # checkout code
    git clone https://github.com/codeforanchorage/realtime-bus-sms.git

    # install deps
    cd realtime-bus-sms
    npm install

    # run 
    # By default, this will serve on http://127.0.0.1:8080
    ./bin/www

    # run tests
    sudo npm install -g nodeunit   # install testing framework
    npm test

Mac:

    TODO: add

Windows:

    TODO: add


