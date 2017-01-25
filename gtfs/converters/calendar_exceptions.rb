require 'csv'
require 'json'

exceptions = []

CSV.foreach('raw/calendar_dates.txt', headers: true) do |row|
  exceptions << {
      date: row['date'],
      service_id: row['service_id'],
      exception_type: row['exception_type']
  }
end

File.open('geojson/exceptions.json', 'w') do |f|
  f.write(JSON.pretty_generate(exceptions: exceptions))
end