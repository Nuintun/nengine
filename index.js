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
var mix = require('./lib/mix');
var pkg = require('./package.json');
var NengineServer = require('./lib/nengine');

// variable declaration
var CWD = process.cwd();

/**
 * file is exists sync
 * @param path
 * @param [mode]
 * @returns {boolean}
 */
var existsSync = fs.accessSync ? function (path, mode){
  try {
    fs.accessSync(path, fs.constants[mode]);

    return true;
  } catch (e) {
    return false;
  }
} : fs.existsSync;

// the module to be exported.
module.exports = {
  version: pkg.version,
  description: pkg.description,
  cli: require('./lib/cli'),
  create: function (options){
    return new NengineServer(options);
  },
  exec: function (cmd, options){
    var fileOptions;
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
      // hostname
      options.hostname = options.hostname || '127.0.0.1';

      // file config
      fileOptions = options.configfile || path.join(options.root, 'nengine.yml');

      // file config
      if (existsSync(fileOptions, 'R_OK')) {
        // parse yaml
        try {
          fileOptions = fs.readFileSync(fileOptions);
          fileOptions = yaml.safeLoad(fileOptions);
        } catch (exception) {
          console.log(JSON.stringify(exception, null, 2));
        }

        // can not set root in config file
        delete fileOptions.root;
      }

      // mix options
      options = mix(fileOptions, options);

      // format key
      if (typeof options.key === 'string') {
        options.key = path.join(options.root, options.key);
      }

      // format cert
      if (typeof options.cert === 'string') {
        options.cert = path.join(options.root, options.cert);
      }

      // https key
      if (existsSync(options.key, 'R_OK')) {
        options.key = fs.readFileSync(options.key);
      } else {
        options.key = null;
      }

      // https cert
      if (existsSync(options.cert, 'R_OK')) {
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
