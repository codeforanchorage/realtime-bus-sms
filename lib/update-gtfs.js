var fs = require('fs')
var request = require('request')

var RAW_DIR  = "../gtfs/raw/"
var GTF_FILE  = "People_Mover.gtfs.zip"
var MUNI_URL = "http://gtfs.muni.org/"

//var MUNI_URL = "http://localhost:8000/"
//var GTF_FILE = "index.css.zip"

GTFSModifiedDate(RAW_DIR+GTF_FILE)
.then((modDate) => getGTFSFile(MUNI_URL+GTF_FILE,modDate, RAW_DIR, GTF_FILE ))
.then((httpStatus) => console.log("Status: ", httpStatus))
.catch((err) => console.log("error", err))


function GTFSModifiedDate(path){
    return new Promise( (resolve, reject) => {
        fs.stat(path, (err, stats) => {
            if (err) {
                console.log("error: ", err)
                return reject(err)
                //No file?
            }
            var mtime = stats.mtime // date object
            resolve(mtime.toUTCString())
        })
    });
}

function getGTFSFile(url, modDate, dir, file) {
    var options = {
        url: url,
        encoding: null, // according to docs best for binary buffer
        headers: {
            "If-Modified-Since": modDate 
        }
    }
    return new Promise((resolve, reject) => {
        request(options, (error, response, body) => {
            if (!error && response.statusCode == 304){
                return resolve(response.statusCode)
            }
            if (!error && response.statusCode == 200) { 
                fs.writeFile(dir+file, body, 'binary', (err) => {
                    if (err) return reject("could not write GTFS file to: " + dir+file)
                    return resolve(response.statusCode)
                })
            } else {
                reject(error) // will be 304 not modified most of the time
            }
        }) 
    })
}