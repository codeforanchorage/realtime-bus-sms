exports.goodResponse = {
    "candidates" : [
       {
          "formatted_address" : "632 W 6th Ave",
          "geometry" : {
             "location" : {
                "lat" : 61.21632990000001,
                "lng" : -149.8948221
             },
             "viewport" : {
                "northeast" : {
                   "lat" : 61.21781042989273,
                   "lng" : -149.8934750701073
                },
                "southwest" : {
                   "lat" : 61.21511077010728,
                   "lng" : -149.8961747298927
                }
             }
          },
          "name" : "632 W 6th Ave",
          "types" : [ "premise" ]
       }
    ],
    "debug_log" : {
       "line" : []
    },
    "status" : "OK"
 }

 exports.glennAlpsLocation = {
    "candidates" : [
       {
          "formatted_address" : "13735 Canyon Rd, Anchorage, AK 99516, USA",
          "geometry" : {
             "location" : {
                "lat" : 61.09633889999999,
                "lng" : -149.7103895
             },
             "viewport" : {
                "northeast" : {
                   "lat" : 61.09768872989272,
                   "lng" : -149.7090396701073
                },
                "southwest" : {
                   "lat" : 61.09498907010727,
                   "lng" : -149.7117393298927
                }
             }
          },
          "name" : "13735 Canyon Rd",
          "types" : [ "street_address" ]
       }
    ],
    "debug_log" : {
       "line" : []
    },
    "status" : "OK"
 }

 exports.failedResponse = {
     "status" : "INVALID_REQUEST"
 }

 // nonspecific responses are what happens when the geocoder doesn't
 // find the specific address. It just returns empty resuts
 exports.nonspecificResponse = {
    "candidates" : [],
    "debug_log" : {
       "line" : []
    },
    "status" : "ZERO_RESULTS"
 }
 exports.badRequest = {statusCode: 403}