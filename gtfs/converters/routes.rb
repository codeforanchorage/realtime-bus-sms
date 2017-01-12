require 'csv'
require 'json'

shapecache = Hash.new
shape_id = nil

coordinates = []

CSV.foreach('raw/shapes.txt', headers: true) do |shaperow|
  if shaperow['shape_id'] != shape_id
    if shape_id
      shapecache[shape_id] = coordinates
    end
    coordinates = []
    shape_id = shaperow['shape_id']
  end
  coordinates << [shaperow['shape_pt_lon'].to_f, shaperow['shape_pt_lat'].to_f]
end

features = []
shape_id = nil
route_id = nil

CSV.foreach('raw/trips.txt', headers: true) do |triprow|
  if triprow['shape_id'] != shape_id or triprow['route_id'] != route_id
    CSV.foreach('raw/routes.txt', headers: true) do |routerow|
      if routerow['route_id'] = triprow['route_id']
        features << {
          type: 'Feature',
          properties: {
            route_id: triprow['route_id'],
            trip_headsign: triprow['trip_headsign'],
            direction_id: triprow['direction_id'],
            shape_id: triprow['shape_id'],
            route_short_name: routerow['route_short_name'],
            route_long_name: routerow['route_long_name'],
            route_description: routerow['route_description']
            },
          geometry: {
            type: 'LineString',
            coordinates: shapecache[triprow['shape_id']]
          }
        }
      end
    end
  end
  shape_id = triprow['shape_id']
  route_id = triprow['route_id']
end

File.open('geojson/routes.json', 'w') do |f|
  f.write(JSON.pretty_generate({type: 'FeatureCollection', features: features}))
end