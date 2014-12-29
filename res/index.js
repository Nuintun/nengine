/**
 * nengine
 * https://nuintun.github.io/nengine
 *
 * Licensed under the MIT license
 * https://github.com/Nuintun/nengine/blob/master/LICENSE
 */

'use strict';

var base = __dirname,
  fs = require('fs'),
  path = require('path'),
  mix = require('../lib/mix'),
  template = require('./template');
// Set template config
template.config('base', base);
template.config('compress', true);
template.config('cache', false);

/**
 * Render template
 * @param root
 * @param filepath
 * @param data
 * @returns {String|Function|*|exports}
 */
function render(root, filepath, data){
  var relapath = '/' + path.relative(root, base).replace(/\\/g, '/');

  data = mix({}, data);

  data.ROOT = relapath;

  return template(filepath, data);
}

module.exports = function (root){
  return {
    html: {
      folder: function (dirname, files, cwd){
        var stats = [];

        files.forEach(function (file){
          var stat;
          try {
            stat = fs.statSync(path.join(cwd, file));

            stats.push({
              name: file,
              type: stat.isDirectory() ? 'DIR' : 'FILE',
              mtime: stat.mtime
            });
          } catch (e) {
            stats.push({
              name: file,
              type: 'UNKNOW',
              mtime: 'UNKNOW'
            });
          }
        });

        return render(root, '/html/folder', {
          files: stats,
          dirname: dirname
        });
      },
      'default': function (status, message){
        return render(root, '/html/status', {
          status: status,
          message: message
        });
      }
    },
    render: render
  };
};