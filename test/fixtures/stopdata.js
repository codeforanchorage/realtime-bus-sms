module.exports.stoptimes = {
    data: {
        stops: [
        {
            name: 'LAKE OTIS - Inbound',
            number: 2,
            times: [ '3:22 PM', '3:56 PM', '4:24 PM' ]
        },
        {
            name: 'EAGLE RIVER/CHUGIAK - Outbound',
            number: 102,
            times: [ '3:20 PM', '3:53 PM', '4:23 PM' ] },
        {
            name: 'TUDOR - Inbound',
            number: 75,
            times: [ '3:40 PM', '4:09 PM', '4:39 PM' ]
        }],
        stop: 'A STREET and 36TH AVENUE NNE',
        stopId: 99
    },
    muniTime: 42
}

module.exports.stops_from_location = {
     data: {
        stops:  [
            {
                route: '5TH AVENUE & F STREET WNW',
                stopId: '3507',
                distance: 0.05691845245927328,
                ll: '-149.893845,61.217605'
            },
            {
                route: 'CITY HALL',
                stopId: '1450',
                distance: 0.0745025245603552,
                ll: '-149.894747,61.216565'
            },
            {
                route: 'DOWNTOWN TRANSIT CENTER',
                stopId: '2051',
                distance: 0.0810384451911698,
                ll: '-149.896764,61.216553'
            },
            {
                 route: '5TH AVENUE & H STREET WNW',
                stopId: '1359',
                distance: 0.10117887117697162,
                ll: '-149.898591,61.217639'
            },
            {
                route: '6TH AVENUE & H STREET WSW',
                stopId: '1735',
                distance: 0.10384580227309781,
                ll: '-149.897789,61.216522'
            }
        ],
        geocodedAddress: 'W 5th Ave & G St, Anchorage, AK 99501, USA' },
        geocodeTime: 216
    }

module.exports.no_stops_near_location = {
     data: {
        stops:  [],
        geocodedAddress: '18700 Citation Road, Anchorage, AK 99501, USA' },
        geocodeTime: 216
}

module.exports.stops_by_lat_lon =  [
    {
        route: '5TH AVENUE & F STREET WNW',
        stopId: '3507',
        distance: 0.04541851448508251,
        ll: '-149.893845,61.217605'
    },
    {
        route: 'CITY HALL',
        stopId: '1450',
        distance: 0.07120210435488765,
        ll: '-149.894747,61.216565'
    },
    {
        route: 'DOWNTOWN TRANSIT CENTER',
        stopId: '2051',
        distance: 0.08735956565747902,
        ll: '-149.896764,61.216553'
    },
    {
        route: '6TH AVENUE & H STREET WSW',
        stopId: '1735',
        distance: 0.11240041177447549,
        ll: '-149.897789,61.216522'
    },
    {
        route: '5TH AVENUE & H STREET WNW',
        stopId: '1359',
        distance: 0.11267689786891662,
        ll: '-149.898591,61.217639'
    }
]