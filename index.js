/**
 * nengine
 * https://nuintun.github.io/nengine
 *
 * Licensed under the MIT license
 * https://github.com/Nuintun/nengine/blob/master/LICENSE
 */

'use strict';

// external lib
var fs = require('fs');
var path = require('path');
var http = require('http');
var yaml = require('js-yaml');
var util = require('./lib/util');
var pkg = require('./package.json');
var NengineServer = require('./lib/nengine');

// variable declaration
var CWD = process.cwd();

/**
 * file exists sync
 * @param src
 * @returns {boolean}
 */
function fileExistsSync(src) {
  if (!src || !util.string(src)) return false;

  try {
    return fs.statSync(src).isFile();
  } catch (error) {
    // check exception. if ENOENT - no such file or directory ok, file doesn't exist.
    // otherwise something else went wrong, we don't have rights to access the file, ...
    if (error.code !== 'ENOENT') {
      throw error;
    }

    return false;
  }
}

// the module to be exported.
module.exports = {
  version: pkg.version,
  description: pkg.description,
  cli: require('./lib/cli'),
  create: function(options) {
    return new NengineServer(options);
  },
  exec: function(cmd, options) {
    var yml;
    var help = require('./lib/help');

    // show version
    if (options.version) {
      help.version(options.verbose);
    }

    // show help
    if (options.help) {
      help.help();
      process.exit();
    }

    // run server
    if (!cmd.length || cmd[0] === 'run') {
      // root
      options.root = options.root || CWD;
      options.root = options.configfile ? path.dirname(options.configfile) : options.root;

      // file config
      yml = options.configfile || path.join(options.root, 'nengine.yml');

      // file config
      if (fileExistsSync(yml)) {
        // parse yaml
        var source = fs.readFileSync(yml);

        yml = yaml.safeLoad(source, {
          filename: yml
        });

        // can not set root in config file
        delete yml.root;
      }

      // mix options
      options = util.extend(true, yml, options);

      // hostname
      options.hostname = options.hostname && util.string(options.hostname)
        ? options.hostname : false;

      // format key
      if (typeof options.key === 'string') {
        options.key = path.join(options.root, options.key);
      }

      // format cert
      if (typeof options.cert === 'string') {
        options.cert = path.join(options.root, options.cert);
      }

      // https key
      if (fileExistsSync(options.key)) {
        options.key = fs.readFileSync(options.key);
      } else {
        options.key = null;
      }

      // https cert
      if (fileExistsSync(options.cert)) {
        options.cert = fs.readFileSync(options.cert);
      } else {
        options.cert = null;
      }

      // run server
      return this.create(options).run();
    } else {
      help.help();
      process.exit();
    }

    return this;
  }
};
