require 'csv'
require 'json'

features = []

CSV.foreach('../raw/stops.txt', headers: true) do |row|
  features << {
    type: 'Feature',
    properties: {
      name: row['stop_name'],
      stop_id: row['stop_id'],
      stop_code: row['stop_code']
    },
    geometry: {
      type: 'Point',
      coordinates: [row['stop_lon'].to_f, row['stop_lat'].to_f]
    }
  }
end

File.open('../geojson/stops.json', 'w') do |f|
  f.write(JSON.pretty_generate({type: 'FeatureCollection', features: features}))
end