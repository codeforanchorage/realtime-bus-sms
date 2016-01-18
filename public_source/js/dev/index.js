/**
 *  DEVELOPMENT SCRIPT
 *    Only appears in development public folder, and not public production folder.
 *    Useful for reloaders and debugging tools.
 */

var buildData = require('_buildData');

console.log(buildData);

(function(port) {
  var host = (location.host || 'localhost').split(':')[0];
  document.write('<script src="http://'+host+':'+port+'/livereload.js?snipver=1"></script>');
})(buildData.reloadPort);
