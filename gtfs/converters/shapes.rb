require 'csv'
require 'json'

# TODO: scripts expects shape_id and shape_pt_sequence to be in order in file
# e.g. all points of single shape together, and shape_pt_sequence increasing

features = []

coordinates = []
shape_id = nil 
CSV.foreach('raw/shapes.txt', headers: true) do |row|  
  if row['shape_id'] != shape_id
    # new shape!    
    if shape_id
      features << {
        type: 'Feature',
        properties: {
          shape_id: row['shape_id']
          },
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        }
      }
    end    
    coordinates = []
    shape_id = row['shape_id']
  end

  coordinates << [row['shape_pt_lon'].to_f, row['shape_pt_lat'].to_f]
end

File.open('geojson/shapes.json', 'w') do |f|
  f.write(JSON.pretty_generate({type: 'FeatureCollection', features: features}))
end