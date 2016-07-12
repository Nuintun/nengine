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

      // https key
      if (fs.existsSync(options.key)) {
        options.key = fs.readFileSync(options.key);
      } else {
        options.key = null;
      }

      // https cert
      if (fs.existsSync(options.cert)) {
        options.cert = fs.readFileSync(options.cert);
      } else {
        options.cert = null;
      }

      // file config
      fileOptions = options.configfile || path.join(options.root, 'nengine.yml');

      // file config
      if (fs.existsSync(fileOptions)) {
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

      // run server
      return this.create(mix(fileOptions, options)).run();
    } else {
      help.help();
      process.exit();
    }

    return this;
  }
};
