/**

  TODO:
    [ ] Clean up notifications.




*/

var path = require('path');
var fs = require('fs');
var gulp = require('gulp');
var gutil = require('gulp-util');
var es = require('event-stream');
var glob = require('glob');
var runSequence = require('run-sequence');
var source = require('vinyl-source-stream');
var chokidar = require('chokidar');
var rimraf = require('rimraf');

var sass = require('gulp-sass');
var plumber = require('gulp-plumber');
var sourcemaps = require('gulp-sourcemaps');
var prefix = require('gulp-autoprefixer');

var browserify = require('browserify');
var watchify = require('watchify');


const SOURCE_DIR = 'public_source';
const PRODUCTION_DIR = 'public_production';
const DEVELOPMENT_DIR = 'public_development';


/* RM --RF TASK

  Empties destination directories. Fire this before tasks to keep those dirs clean.

*/

gulp.task('clean', function() {

  rimraf.sync(path.join(PRODUCTION_DIR, '*'));
  rimraf.sync(path.join(DEVELOPMENT_DIR, '*'));

});


/* DEFAULT TASK

  This runs everything.

*/

gulp.task('default', ['production']);

gulpSequentialTask('production',
  'clean',
  ['styles-development', 'scripts-development'],
  ['styles-production', 'scripts-production']
);


/* WATCH TASK

  This runs everything, then watches source files for changes.

*/

gulpSequentialTask('watch',
  'clean',
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
  return miscCopy(PRODUCTION_DIR, miscGlob());
});

gulp.task('misc-development', function() {
  return miscCopy(DEVELOPMENT_DIR, miscGlob());
});

gulp.task('misc-watch', function() {

  var glob = miscGlob();

  watch(glob, run);
  run();

  function run(glob) {
    // LOG HERE
    if (typeof glob === 'undefined') glob = miscGlob();
    miscCopy(DEVELOPMENT_DIR, glob);
    miscCopy(PRODUCTION_DIR, glob);
  }

});

function miscCopy(dir, glob) {

  return gulp.src(glob)
    .pipe(gulp.dest(dir))
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


const DEVELOPMENT_SCSS_OPTS = {

};

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

  gutil.log(gutil.colors.green('Compiling styles / PRODUCTION'));

  return gulp.src(path.join(SOURCE_DIR, 'scss', '*.scss'))
    .pipe(plumber())
    .pipe(sass(PRODUCTION_SCSS_OPTS))
    .on('error', silent ? ()=>{} : sass.logError)
    .pipe(prefix({ browsers: [ '> 5%', 'Explorer >= 11' ] }))
    .pipe(gulp.dest(path.join(PRODUCTION_DIR, 'css')))
  ;

}

function scssDevelopment(silent) {

  gutil.log(gutil.colors.green('Compiling styles / DEVELOPMENT'));

  return gulp.src(path.join(SOURCE_DIR, 'scss', '*.scss'))
    .pipe(plumber())
    .pipe(sourcemaps.init())
    .pipe(sass(DEVELOPMENT_SCSS_OPTS))
    .on('error', silent ? ()=>{} : sass.logError)
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
};

const PRODUCTION_JS_OPTS = {
  debug: false,
  paths: [path.join(process.cwd(), 'node_modules')],
  cache: {},
  packageCache: {},
};

gulp.task('scripts-production', function() {

  var b = browserify(path.join(SOURCE_DIR, 'js', 'index.js'), PRODUCTION_JS_OPTS);
  return jsBundler(b, PRODUCTION_DIR+'/js');

});

gulp.task('scripts-development', function() {

  var b = browserify(path.join(SOURCE_DIR, 'js', 'index.js'), DEVELOPMENT_JS_OPTS);
  return jsBundler(b, path.join(DEVELOPMENT_DIR, 'js'));

});

gulp.task('scripts-watch', function() {

  var bProd = browserify(path.join(SOURCE_DIR, 'js'), PRODUCTION_JS_OPTS);
  var bDev = browserify(path.join(SOURCE_DIR, 'js'), DEVELOPMENT_JS_OPTS);

  bProd.plugin(watchify);
  bDev.plugin(watchify);

  jsBundler(bProd, path.join(PRODUCTION_DIR, 'js'), true);
  jsBundler(bDev, path.join(DEVELOPMENT_DIR, 'js'));

});

function jsBundler(b, dest, silent) {

  var rebundle = function() {
    return b.bundle()
      .on('error', function(e) {
        if (silent) return;
        gutil.beep();
        var message = e.annotated || e.message;
        gutil.log(gutil.colors.red(message));
      })
      .pipe(source('index.js'))
      .pipe(gulp.dest(dest))
    ;
  };

  b.on('update', function() {
    rebundle();
  });

  b.on('bytes', function(bytes) {
    gutil.log(gutil.colors.green('Completed script ('+Math.round(bytes/1000)+'kb)'));
  });

  return rebundle();

}



function watch(glob) {

  var callbacks = Array.prototype.slice.call(arguments, 1).reduce(function(a, b) {
    return a.concat(b);
  }, []);

  var opts = {
    ignoreInitial: true,
  };

  chokidar.watch(glob, opts).on('all', function(ev, path) {
    callbacks.forEach(function(callback) {
      callback(path);
    });
  });

}

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
