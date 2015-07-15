'use strict';

var counter = 0;
var ads = [
    'You can also use this service on the web at http://bus.codeforanchorage.org',
];


exports.getAd = function() {
    counter++;
    if (counter === ads.length) {
        counter = 0;
    }

    return ads[counter];
}
