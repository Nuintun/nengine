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
var log4js = require('log4js');
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
  create: function (config){
    return new NengineServer(config);
  },
  exec: function (cmd, options){
    var logs;
    var logger;
    var fileConfig;
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
      // Make log directory
      logs = path.join(config.root, 'logs');

      if (!fs.existsSync(logs)) {
        try {
          fs.mkdirSync(logs);
        } catch (e) {
          process.send(colors.red.bold('Please create "Logs" directory under the root directory.'));
          // Exit process
          process.exit();
        }
      }

      // Configure log4js
      log4js.configure({
        appenders: [
          {
            type: 'console'
          },
          {
            type: 'file',
            maxLogSize: 20480,
            filename: path.join(logs, 'nengine.log'),
            category: 'Nengine'
          }
        ]
      });

      // Get logger
      logger = log4js.getLogger('Nengine');
      logger.setLevel('ALL');
      
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