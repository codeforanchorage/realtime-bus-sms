require 'csv'
require 'json'

features = []
stops = {}
CSV.foreach('raw/stops.txt', headers: true) do |row|
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
  stops.store(row['stop_id'].to_i, row['bt_id'].to_i)
end


File.open('geojson/stops.json', 'w') do |f|
  f.write(JSON.pretty_generate({type: 'FeatureCollection', features: features}))
end

File.open('../lib/stop_number_lookup.js', 'w') do |f|
  f.write("module.exports = " + JSON.pretty_generate(Hash[stops.sort]))
end