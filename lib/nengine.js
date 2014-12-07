/**
 * nengine
 * https://nuintun.github.io/nengine
 *
 * Licensed under the MIT license
 * https://github.com/Nuintun/nengine/blob/master/LICENSE
 */

'use strict';

var fs = require('fs'),
  cwd = process.cwd(),
  dirname = __dirname,
  path = require('path'),
  http = require('http'),
  mix = require('./mix'),
  Send = require('./send'),
  log4js = require('log4js'),
  pkg = require('../package.json'),
  nativeRes = require('../native-assets');

// Colors
require('colors');

/**
 * File send
 * @param requset
 * @param response
 * @returns {*}
 */
function fileSend(requset, response){
  var self = this,
    config = self.config,
    send = self.send.use(requset, response);

  // Directory
  send.on('directory', function (fpath){
    switch (config.directory) {
      case 'allow':
        viewFolder.call(self, this, fpath);
        break;
      case 'deny':
        return send.error(403);
      case 'ignore':
      default:
        return send.error(404);
    }
  });

  // Error
  send.on('error', function (err){
    httpError.call(self, this, err);
  });

  // Send
  send.transfer();
}

/**
 * Error status
 * @param send
 * @param err
 */
function defaultStatus(send, err){
  var self = this,
    status = err.status,
    response = send.response;

  // Set Content-Type
  response.setHeader('Content-Type', 'text/html; charset=utf-8');

  // Not found
  if (status === 404) {
    response.end(self.nativeRes.html['404']);
  } else {
    // Other error
    response.end(self.nativeRes.html['default'](status, err.message));
  }
}

/**
 * Server error
 * @param send
 * @param err
 */
function httpError(send, err){
  var self = this,
    url = send.path,
    status = err.status,
    errorpage = self.config.status[status];

  // Logger
  self.logger.warn('Request: ' + url + ' ' + err.message);

  // Not found favicon.ico use default ico
  if (status === 404 && url === '/favicon.ico' && url !== self.favicon) {
    // Redirect to default favicon
    send.redirect(self.favicon);
  } else {
    // Custom error page
    if (typeof errorpage === 'string') {
      fs.exists(path.join(send.root, errorpage), function (exists){
        if (exists) {
          send.redirect(errorpage);
        } else {
          defaultStatus.call(self, send, err);
        }
      });
    } else {
      // Default error page
      defaultStatus.call(self, send, err);
    }
  }
}

/**
 * Format to http style
 * @param path
 * @returns {XML|*|string|void}
 */
function httpPath(path){
  return path.replace(/\\/g, '/');
}

/**
 * View folder
 * @param send
 * @param fpath
 */
function viewFolder(send, fpath){
  var self = this,
    dirpath = send.path,
    response = send.response;

  // Set Content-Type
  response.setHeader('Content-Type', 'text/html; charset=utf-8');

  // Read directory
  fs.readdir(fpath, function (err, files){
    if (self.config.dotFiles === 'ignore') {
      files = files.filter(function (path){
        return path.charAt(0) !== '.';
      });
    }

    // Response
    response.end(self.nativeRes.html['folder'](dirpath, files));
  });
}

/**
 * NengineServer
 * @param options
 * @returns {*}
 * @constructor
 */
function NengineServer(options){
  var logs, logger, pathToRoot,
    config = mix({}, options);

  // Format params
  config.root = config.root || cwd;
  config.port = config.port || 80;
  config.directory = config.directory || 'deny';
  config.directory = config.directory.toLowerCase();
  config.dotFiles = config.dotFiles || 'ignore';
  config.dotFiles = config.dotFiles.toLowerCase();
  config.status = config.status || {};
  this.nativeRes = nativeRes(config.root);

  // Make log directory
  logs = path.join(config.root, 'logs');

  if (!fs.existsSync(logs)) {
    try {
      fs.mkdirSync(logs);
    } catch (e) {
      console.log('Please create "Logs" directory under the root directory'.red.bold);
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

  // Set property
  this.logger = logger;
  this.config = config;
  // Get path program relative to root
  pathToRoot = '/' + httpPath(path.relative(config.root, path.dirname(dirname)));
  this.favicon = httpPath(path.join(pathToRoot, 'favicon.ico'));
  this.send = new Send(config.root, config);

  // Return instance
  return this;
}

NengineServer.prototype = {
  run: function (){
    var self = this,
      config = self.config,
      server = config.server;

    // Create server
    var httpServer = http.createServer(function (requset, response){
      if (server !== false) {
        server = typeof server === 'string'
          ? server
          : 'Nengine' + (pkg.version ? '/' + pkg.version : '');

        // Set server name
        response.setHeader('Server', server);
      }

      // Send file
      fileSend.call(self, requset, response);
    });

    // Start listening
    httpServer.on('listening', function (){
      self.logger.info('Server runing at port: ' + config.port);
    });

    // Error
    httpServer.on('error', function (err){
      self.logger.error('Server failed to start: ' + err.message);
    });

    // Close
    httpServer.on('close', function (){
      self.logger.info('Server closed');
    });

    // Listen
    httpServer.listen(config.port);

    // Return
    return httpServer;
  }
};

// The module to be exported.
module.exports = {
  version: pkg.version,
  description: pkg.description,
  cli: require('./cli'),
  create: function (config){
    return new NengineServer(config);
  },
  exec: function (cmd, options){
    var fileConfig,
      help = require('./help');

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
      options.root = options.root || cwd;
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
    }

    return this;
  }
};