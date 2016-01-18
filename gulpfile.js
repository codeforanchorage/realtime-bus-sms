/*
 *
 *
 *
/*


/* TODO

    [ ] Add instructions / intro (above).
    [ ] Implement LiveReload with path / port to dev machine on LAN if not localhost.
    --- Update LiveReload when dev machine path / port changes. / Just get address from nav bar.
    [ ] Notify use of dev machine network path / port.
    [x] Clean up notifications.

*/


// Node Core Dependencies

var path = require('path');
var fs = require('fs');
var stream = require('stream');


// Main Dependencies

var gulp = require('gulp');
var gutil = require('gulp-util');
var changed = require('gulp-changed');
var tap = require('gulp-tap');
// var es = require('event-stream');
var gzipSize = require('gzip-size');
var size = require('filesize');
var glob = require('glob');
var runSequence = require('run-sequence');
var source = require('vinyl-source-stream');
var chokidar = require('chokidar');
var rimraf = require('rimraf');
var reload = require('livereload');
var openport = require('openport');


// Stylesheet Dependencies

var sass = require('gulp-sass');
var plumber = require('gulp-plumber');
var sourcemaps = require('gulp-sourcemaps');
var prefix = require('gulp-autoprefixer');


// Javascript Dependencies

var browserify = require('browserify');
var watchify = require('watchify');
var yamlify = require('yamlify');


// Globals

var buildData = {};


// Main configuration

const SOURCE_DIR = 'public_source';
const PRODUCTION_DIR = 'public_production';
const DEVELOPMENT_DIR = 'public_development';
const RELOAD_PORT_RANGE = [8010, 8099];

/* RM --RF TASK

  Empties destination directories. Fire this before tasks to keep those dirs clean.

*/

gulp.task('clean', function() {

  rimraf.sync(path.join(PRODUCTION_DIR, '*'));
  rimraf.sync(path.join(DEVELOPMENT_DIR, '*'));

});


/* DEFAULT TASK

  This runs everything. If doing development, use gulp watch instead.

*/

gulpSequentialTask('default',
  'clean',
  ['misc-development', 'styles-development', 'scripts-development'],
  ['misc-production', 'styles-production', 'scripts-production']
);


/* WATCH TASK

  This runs everything, then watches source files for changes.

*/

gulpSequentialTask('watch',
  'clean',
  ['destination-reload', 'destination-log'],
  ['misc-watch', 'styles-watch', 'scripts-watch']
);


/* MISC BUILD TASKS

  Just copy all the non-SASS and non-Javascript files in source directory.

*/


const EXCLUDED_DIRS = [
  'scss',
  'js',
];

gulp.task('misc-production', function() {
  return miscCopy(miscGlob(), PRODUCTION_DIR);
});

gulp.task('misc-development', function() {
  return miscCopy(miscGlob(), DEVELOPMENT_DIR);
});

gulp.task('misc-watch', function() {

  var glob = miscGlob();

  watch(glob, run);
  run();

  function run() {
    miscCopy(glob, PRODUCTION_DIR, 'SILENT');
    miscCopy(glob, DEVELOPMENT_DIR);
  }

});

function miscCopy(globIn, pathOut, silent) {

  return gulp.src(globIn)
    .pipe(changed(pathOut))
    .pipe(tap((file) => {
      if (silent || !fs.statSync(file.path).isFile()) return;
      var path = file.path;
      if (file.path.substring(0, process.cwd().length) === process.cwd()) {
        path = path.substr(process.cwd().length+1);
      }
      gutil.log(gutil.colors.green('Copying '+path));
    }))
    .pipe(gulp.dest(pathOut))
  ;

}

function miscGlob() {
  return []
    .concat(path.join(SOURCE_DIR, '**', '*'))
    .concat(EXCLUDED_DIRS.map((dirName) => '!'+path.join(SOURCE_DIR, dirName)+'{,'+path.sep+'**}'))
  ;
}


/* SASS BUILD TASKS

*/


const DEVELOPMENT_SCSS_OPTS = {};

const PRODUCTION_SCSS_OPTS = {
  outputStyle: 'compressed',
};

gulp.task('styles-development', function() {

  return scssDevelopment();

});

gulp.task('styles-production', function() {

  return scssProduction();

});

gulp.task('styles-watch', function() {

  var linked = linkedModules();
  var glob = [path.join(SOURCE_DIR, 'scss', '**', '*.scss')]
    .concat(linked.map((dir) => path.join(dir, '**', '*.scss')))
    .concat(linked.map((dir) => path.join(dir, 'node_modules')))
  ;

  watch(glob, run);
  run();

  function run() {
    scssProduction(true);
    scssDevelopment();
  }

});

function scssProduction(silent) {

  if (!silent) gutil.log(gutil.colors.green('Compiling styles'));

  return gulp.src(path.join(SOURCE_DIR, 'scss', '*.scss'))
    .pipe(plumber())
    .pipe(sass(PRODUCTION_SCSS_OPTS))
    .on('error', silent ? () => {} : sass.logError)
    .pipe(prefix({ browsers: [ '> 5%', 'Explorer >= 11' ] }))
    .pipe(gulp.dest(path.join(PRODUCTION_DIR, 'css')))
  ;

}

function scssDevelopment(silent) {

  if (!silent) gutil.log(gutil.colors.green('Compiling styles'));

  return gulp.src(path.join(SOURCE_DIR, 'scss', '*.scss'))
    .pipe(plumber())
    .pipe(sourcemaps.init())
    .pipe(sass(DEVELOPMENT_SCSS_OPTS))
    .on('error', silent ? () => {} : sass.logError)
    .pipe(prefix({ browsers: [ '> 5%', 'Explorer >= 11' ] }))
    .pipe(sourcemaps.write())
    .pipe(gulp.dest(path.join(DEVELOPMENT_DIR, 'css')))
  ;

}


/* JAVASCRIPT BUILD TASKS

  Because JS dependencies are often large, use Watchify to keep this running quickly.

*/


const DEVELOPMENT_JS_OPTS = {
  debug: true,
  paths: [path.join(process.cwd(), 'node_modules')],
  cache: {},
  packageCache: {},
  fullPaths: false,
};

const PRODUCTION_JS_OPTS = {
  debug: false,
  paths: [path.join(process.cwd(), 'node_modules')],
  cache: {},
  packageCache: {},
  fullPaths: false,
};

const JS_TRANSFORMS = [yamlify];
const JS_PLUGINS = [];

gulp.task('scripts-production', function() {

  var b = browserify(path.join(SOURCE_DIR, 'js', 'index.js'), PRODUCTION_JS_OPTS);
  jsStream(b);
  return jsBundler(b, path.join(PRODUCTION_DIR, 'js'));

});

gulp.task('scripts-development', function() {

  var b = browserify(path.join(SOURCE_DIR, 'js', 'index.js'), DEVELOPMENT_JS_OPTS);
  jsStream(b, 'DEVELOPMENT');
  return jsBundler(b, path.join(DEVELOPMENT_DIR, 'js'));

});

gulp.task('scripts-watch', function() {

  var b = browserify(path.join(SOURCE_DIR, 'js', 'index.js'), PRODUCTION_JS_OPTS);
  b = watchify(b);
  jsStream(b);
  jsBundler(b, path.join(PRODUCTION_DIR, 'js'), 'SILENT');

  var b = browserify(path.join(SOURCE_DIR, 'js', 'index.js'), DEVELOPMENT_JS_OPTS);
  b = watchify(b);
  jsStream(b, 'DEVELOPMENT');
  jsBundler(b, path.join(DEVELOPMENT_DIR, 'js'));

});

function jsStream(b, isDev) {

  JS_TRANSFORMS.forEach(t => b.transform(t));
  JS_PLUGINS.forEach(p => b.plugin(p));

  if (isDev) {

    var baseDir = path.join(SOURCE_DIR, 'js', 'dev');
    try {
      var devScriptPath = '.'+path.sep+baseDir;
      require.resolve(devScriptPath);
    }
    catch(e) {
      devScriptPath = null;
      gutil.log(
        gutil.colors.yellow('No js dev script found in'),
        gutil.colors.magenta(baseDir+path.sep)
      );
    }
    if (devScriptPath) {
      var s = new stream.Readable();
      s.push('module.exports = '+JSON.stringify(buildData)+';');
      s.push(null);
      b.exclude('_buildData');
      b.require(s, { expose: '_buildData' }); // make build data requireable
      b.add(devScriptPath, { baseDir }); // concat dev scripts
    }

  }


}

function jsBundler(b, dest, silent) {

  b.on('update', function() {
    rebundle();
  });

  return rebundle();

  function rebundle() {

    if (!silent) gutil.log(gutil.colors.green('Compiling scripts'));

    return b.bundle()
      .on('error', silent ? () => {} : (e) => {
        gutil.beep();
        var message = e.annotated || e.message;
        gutil.log(gutil.colors.red(message));
      })
      .pipe(source('index.js'))
      .pipe(gulp.dest(dest))
    ;
  }

}


/* FILE UPDATE TASKS

  Watches destination folders, LiveReloading files and providing details when they change.

*/


gulp.task('destination-reload', function(done) {

  openport.find({ ports: RELOAD_PORT_RANGE }, (err, port) => {
    if (err) return gutil.log(gutil.color.red(err));
    init(port);
  });

  function init(port) {
    buildData.reloadPort = port;
    reloadServer = reload.createServer({port});
    reloadServer.watch(path.join(DEVELOPMENT_DIR, '**', '*'));
    gutil.log(
      gutil.colors.green('LiveReload listening'),
      'on',
      gutil.colors.magenta('port '+port)
    )
    done();
  }

});


gulp.task('destination-log', function() {

  var glob = [path.join(PRODUCTION_DIR, '**', '*'), path.join(DEVELOPMENT_DIR, '**', '*')];
  watch(glob, (filePath, stat) => {
    var root = filePath.split(path.sep)[0];
    if (root === PRODUCTION_DIR) {
      fs.readFile(filePath, (err, buffer) => gzipSize(buffer, (err, zipSize) => {
        gutil.log(
          gutil.colors.yellow(filePath),
          gutil.colors.magenta(size(zipSize, {spacer: ' '}))
        );
      }));
    }
    else if (root === DEVELOPMENT_DIR) {
      gutil.log(
        gutil.colors.grey(filePath),
        gutil.colors.grey(size(stat.size, {spacer: ' '}))
      );
    }
  });

});


/* TOP LEVEL FUNCTIONS USED THROUGHOUT
*
*/


// gulp.watch is slow. Use chokidar.

function watch(glob) {

  var callbacks = Array.prototype.slice.call(arguments, 1).reduce(function(a, b) {
    return a.concat(b);
  }, []);

  var opts = {
    ignoreInitial: true,
  };

  chokidar.watch(glob, opts).on('all', function(ev, path) {
    var stat = fs.statSync(path);
    if (!stat.isFile()) return;
    callbacks.forEach(function(callback) {
      callback(path, stat);
    });
  });

}


// Generates glob only of modules from npm link

function linkedModules() {

  var modulesDir = path.join(process.cwd(), 'node_modules');

  return fs.readdirSync(modulesDir)
    .filter((name) => {
      try {
        return fs.lstatSync(path.join(modulesDir, name)).isSymbolicLink();
      }
      catch(e) {
        return false;
      }
    })
    .map((name) => path.join(modulesDir, name))
  ;

}


// Temporary shim until Gulp 4.0 releases sequential tasks.

function gulpSequentialTask() {

  var args = Array.prototype.slice.call(arguments);
  var name = args.shift();

  gulp.task(name, function(done) {
    args.push(done);
    runSequence.apply(null, args);
  });

}


// For catching all on through streams and not reporting them.

function noop() {}
