/**
 * nengine
 * https://nuintun.github.io/nengine
 *
 * Licensed under the MIT license
 * https://github.com/Nuintun/nengine/blob/master/LICENSE
 */

'use strict';

// External lib
var fs = require('fs');
var path = require('path');
var http = require('http');
var mix = require('./lib/mix');
var pkg = require('./package.json');
var NengineServer = require('./lib/nengine');

// Variable declaration
var CWD = process.cwd();

// The module to be exported.
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

    // Show version
    if (options.version) {
      help.version(options.verbose);
    }

    // Show help
    if (options.help) {
      help.help();
      process.exit();
    }

    // Run server
    if (!cmd.length || cmd[0] === 'run') {
      // Root
      options.root = options.root || CWD;
      options.root = options.configfile ? path.dirname(options.configfile) : options.root;

      // File config
      fileOptions = options.configfile || path.join(options.root, 'nengine.json');

      // File config
      if (fs.existsSync(fileOptions)) {
        fileOptions = require(fileOptions);

        // Can not set root in config file
        delete fileOptions.root;
      }

      // Run server
      return this.create(mix(fileOptions, options)).run();
    } else {
      help.help();
      process.exit();
    }

    return this;
  }
};
