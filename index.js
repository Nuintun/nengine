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
var mix = require('./mix');
var pkg = require('../package.json');
var NengineServer = require('./lib/nengine');

// The module to be exported.
module.exports = {
  version: pkg.version,
  description: pkg.description,
  cli: require('./cli'),
  create: function (config){
    return new NengineServer(config);
  },
  exec: function (cmd, options){
    var fileConfig;
    var help = require('./help');

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
      options.root = options.configfile ? path.dirname(options.configfile) : options.root;
      options.root = options.root || CWD;
      // File config
      fileConfig = options.configfile || path.join(options.root, 'nengine.json');

      // File config
      if (fs.existsSync(fileConfig)) {
        fileConfig = require(fileConfig);

        // Can not set root in config file
        delete fileConfig.root;
      }

      // Run server
      return this.create(mix(fileConfig, options)).run();
    } else {
      help.help();
      process.exit();
    }

    return this;
  }
};