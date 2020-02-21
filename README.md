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

There are several environment variables that need to be set up when you configure the installation. Check lib/config.js

Vagrant:

    # create vagrant vm
    vagrant up

    # get onto vagrant vm
    vagrant ssh

    # install npm deps within virtual machine
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

Third Party Services
--------------------

This app depends on third party service that require api keys to run. When running in production the api keys are added as environmental variables when the app starts. To run a fully functioning version locally, you will need copy your own api keys into config.js or add them as environmental variables.

- Watson Conversation from IBM. This identifies user intent from input other than stop numbers
- Google Place. Geolocates addressed and places
- Google Analytics.

The app will run without api keys for these services but you will get warnings and errors if a response to input calls one of the services.

**Watson Setup**

You can create a free account on IBM Bluemix and clone the Watson Service using the *watson-workspace.json* file in the repo.

To create an account, go to:

https://www.ibm.com/watson/services/conversation/

Click get started for free and create an IBM account by filling out the form.

Once logged in and confirmed you can access the IBM Watson Bluemix console (https://watson-conversation.ng.bluemix.net)

Create a clone of the Watson workplace by clicking the upload icon under workplaces and uploading the *watson-workspace.json* file. The workplace will then have a workplace ID (accessed by clicking the three dots next to the name) such as 6cb32c12-6b1s-1273-f81f-3ae0984c7c2b which you can add to your configuration or env file for WATSON_WORKPLACE_ID.

You will also need to find your login credentials for the Watson app. These are not in an obvious place. Go to:
https://console.bluemix.net/dashboard/apps/

Click the service you just created. Then in the left menu click 'service credentials' than click veiw credentials in the table on the page. This will show you a username and password which you can add to your conviguration for
WATSON_API_KEY and WATSON_ASSISTANT_KEY

**Google Places**

To create an API Key go to and follow prompts:
https://developers.google.com/places/web-service/get-api-key