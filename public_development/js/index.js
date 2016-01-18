require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{"_buildData":"_buildData"}],2:[function(require,module,exports){
/**
 *  MAIN SCRIPT
 *    Point of entry for front-end application.
 */

},{}],"_buildData":[function(require,module,exports){
module.exports = {"reloadPort":8010};
},{}]},{},[2,1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJwdWJsaWNfc291cmNlL2pzL2RldiIsInB1YmxpY19zb3VyY2UvanMvaW5kZXguanMiLCJfc3RyZWFtXzEuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKipcbiAqICBERVZFTE9QTUVOVCBTQ1JJUFRcbiAqICAgIE9ubHkgYXBwZWFycyBpbiBkZXZlbG9wbWVudCBwdWJsaWMgZm9sZGVyLCBhbmQgbm90IHB1YmxpYyBwcm9kdWN0aW9uIGZvbGRlci5cbiAqICAgIFVzZWZ1bCBmb3IgcmVsb2FkZXJzIGFuZCBkZWJ1Z2dpbmcgdG9vbHMuXG4gKi9cblxudmFyIGJ1aWxkRGF0YSA9IHJlcXVpcmUoJ19idWlsZERhdGEnKTtcblxuY29uc29sZS5sb2coYnVpbGREYXRhKTtcblxuKGZ1bmN0aW9uKHBvcnQpIHtcbiAgdmFyIGhvc3QgPSAobG9jYXRpb24uaG9zdCB8fCAnbG9jYWxob3N0Jykuc3BsaXQoJzonKVswXTtcbiAgZG9jdW1lbnQud3JpdGUoJzxzY3JpcHQgc3JjPVwiaHR0cDovLycraG9zdCsnOicrcG9ydCsnL2xpdmVyZWxvYWQuanM/c25pcHZlcj0xXCI+PC9zY3JpcHQ+Jyk7XG59KShidWlsZERhdGEucmVsb2FkUG9ydCk7XG4iLCIvKipcbiAqICBNQUlOIFNDUklQVFxuICogICAgUG9pbnQgb2YgZW50cnkgZm9yIGZyb250LWVuZCBhcHBsaWNhdGlvbi5cbiAqL1xuIiwibW9kdWxlLmV4cG9ydHMgPSB7XCJyZWxvYWRQb3J0XCI6ODAxMH07Il19
