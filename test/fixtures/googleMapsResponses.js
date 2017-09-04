exports.goodResponse = {
    "results" : [
       {
          "address_components" : [
             {
                "long_name" : "632",
                "short_name" : "632",
                "types" : [ "street_number" ]
             },
             {
                "long_name" : "West 6th Avenue",
                "short_name" : "W 6th Ave",
                "types" : [ "route" ]
             },
             {
                "long_name" : "Downtown",
                "short_name" : "Downtown",
                "types" : [ "neighborhood", "political" ]
             },
             {
                "long_name" : "Anchorage",
                "short_name" : "Anchorage",
                "types" : [ "locality", "political" ]
             },
             {
                "long_name" : "Anchorage",
                "short_name" : "Anchorage",
                "types" : [ "administrative_area_level_2", "political" ]
             },
             {
                "long_name" : "Alaska",
                "short_name" : "AK",
                "types" : [ "administrative_area_level_1", "political" ]
             },
             {
                "long_name" : "United States",
                "short_name" : "US",
                "types" : [ "country", "political" ]
             },
             {
                "long_name" : "99501",
                "short_name" : "99501",
                "types" : [ "postal_code" ]
             }
          ],
          "formatted_address" : "632 W 6th Ave, Anchorage, AK 99501, USA",
          "geometry" : {
             "bounds" : {
                "northeast" : {
                   "lat" : 61.21647240000001,
                   "lng" : -149.8943509
                },
                "southwest" : {
                   "lat" : 61.216193,
                   "lng" : -149.8953727
                }
             },
             "location" : {
                "lat" : 61.2163327,
                "lng" : -149.8948618
             },
             "location_type" : "ROOFTOP",
             "viewport" : {
                "northeast" : {
                   "lat" : 61.2176816802915,
                   "lng" : -149.8935128197085
                },
                "southwest" : {
                   "lat" : 61.21498371970848,
                   "lng" : -149.8962107802915
                }
             }
          },
          "partial_match" : true,
          "place_id" : "ChIJ80XfroC9yFYRb4ltnt-cwc0",
          "types" : [ 'street_address' ]
       }
    ],
    "status" : "OK"
 }

 exports.glennAlpsLocation = {
    "results" : [
       {
          "address_components" : [
             {
                "long_name" : "13735",
                "short_name" : "13735",
                "types" : [ "street_number" ]
             },
             {
                "long_name" : "Canyon Road",
                "short_name" : "Canyon Rd",
                "types" : [ "route" ]
             },
             {
                "long_name" : "Glen Alps",
                "short_name" : "Glen Alps",
                "types" : [ "neighborhood", "political" ]
             },
             {
                "long_name" : "Anchorage",
                "short_name" : "Anchorage",
                "types" : [ "locality", "political" ]
             },
             {
                "long_name" : "Anchorage",
                "short_name" : "Anchorage",
                "types" : [ "administrative_area_level_2", "political" ]
             },
             {
                "long_name" : "Alaska",
                "short_name" : "AK",
                "types" : [ "administrative_area_level_1", "political" ]
             },
             {
                "long_name" : "United States",
                "short_name" : "US",
                "types" : [ "country", "political" ]
             },
             {
                "long_name" : "99516",
                "short_name" : "99516",
                "types" : [ "postal_code" ]
             }
          ],
          "formatted_address" : "13735 Canyon Rd, Anchorage, AK 99516, USA",
          "geometry" : {
             "bounds" : {
                "northeast" : {
                   "lat" : 61.09634800000001,
                   "lng" : -149.7103882
                },
                "southwest" : {
                   "lat" : 61.09633889999999,
                   "lng" : -149.7103895
                }
             },
             "location" : {
                "lat" : 61.09634800000001,
                "lng" : -149.7103882
             },
             "location_type" : "RANGE_INTERPOLATED",
             "viewport" : {
                "northeast" : {
                   "lat" : 61.0976924302915,
                   "lng" : -149.7090398697085
                },
                "southwest" : {
                   "lat" : 61.0949944697085,
                   "lng" : -149.7117378302915
                }
             }
          },
          "place_id" : "EikxMzczNSBDYW55b24gUmQsIEFuY2hvcmFnZSwgQUsgOTk1MTYsIFVTQQ",
          "types" : [ "street_address" ]
       }
    ],
    "status" : "OK"
 }

 exports.failedResponse = {
     "status" : "INVALID_REQUEST"
 }

 // nonspecific responses are what happens when the geocoder doesn't
 // find the specific address. It just returns coordinates for the city
 exports.nonspecificResponse = {
    "results" : [
       {
          "address_components" : [
             {
                "long_name" : "Anchorage",
                "short_name" : "Anchorage",
                "types" : [ "locality", "political" ]
             },
             {
                "long_name" : "Anchorage",
                "short_name" : "Anchorage",
                "types" : [ "administrative_area_level_2", "political" ]
             },
             {
                "long_name" : "Alaska",
                "short_name" : "AK",
                "types" : [ "administrative_area_level_1", "political" ]
             },
             {
                "long_name" : "United States",
                "short_name" : "US",
                "types" : [ "country", "political" ]
             }
          ],
          "formatted_address" : "Anchorage, AK, USA",
          "geometry" : {
             "bounds" : {
                "northeast" : {
                   "lat" : 61.48393789999999,
                   "lng" : -148.460007
                },
                "southwest" : {
                   "lat" : 60.733791,
                   "lng" : -150.4206149
                }
             },
             "location" : {
                "lat" : 61.2180556,
                "lng" : -149.9002778
             },
             "location_type" : "APPROXIMATE",
             "viewport" : {
                "northeast" : {
                   "lat" : 61.48389109999999,
                   "lng" : -148.4600069
                },
                "southwest" : {
                   "lat" : 60.733791,
                   "lng" : -150.2862832
                }
             }
          },
          "partial_match" : true,
          "place_id" : "ChIJQT-zBHaRyFYR42iEp1q6fSU",
          "types" : [ "locality", "political" ]
       }
    ],
    "status" : "OK"
 }

 exports.badRequest = {statusCode: 403}