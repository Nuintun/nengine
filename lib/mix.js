/**
 * nengine
 * https://nuintun.github.io/nengine
 *
 * Licensed under the MIT license
 * https://github.com/Nuintun/nengine/blob/master/LICENSE
 */

'use strict';

// hasOwnProperty
var hasOwn = Object.prototype.hasOwnProperty;

/**
 * mix object
 * @returns {{}}
 */
function mix(){
  var key;
  var obj;
  var i = 0;
  var result = {};
  var len = arguments.length;

  for (; i < len; ++i) {
    obj = arguments[i];

    for (key in obj) {
      if (hasOwn.call(obj, key)) {
        result[key] = obj[key];
      }
    }
  }

  return result;
}

// exports
module.exports = mix;