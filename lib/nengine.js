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
var Send = require('file-send');
var log4js = require('log4js');
var pkg = require('../package.json');
var res = require('../res');
var colors = require('colors/safe');

// Variable declaration
var CWD = process.cwd();
var DIRNAME = __dirname;

/**
 * File send
 * @param requset
 * @param response
 * @returns {*}
 */
function fileSend(requset, response){
  var self = this;
  var config = self.config;
  var send = new Send(requset, config);

  // Directory
  send.on('dir', function (fpath, stats, next){
    switch (config.directory) {
      case 'allow':
        viewFolder.call(self, response, send, fpath, next);
        break;
      case 'deny':
        return send.error(response, 403);
      case 'ignore':
      default:
        return send.error(response, 404);
    }
  });

  // Error
  send.on('error', function (error, next){
    httpError.call(self, response, send, error, next);
  });

  // Send
  send.pipe(response);
}

/**
 * Error status
 * @param response
 * @param error
 * @param next
 */
function defaultStatus(response, error, next){
  var self = this;
  var status = error.statusCode;

  // Set Content-Type
  response.setHeader('Content-Type', 'text/html; charset=UTF-8');
  next(self.res.html['default'](status, error.message));
}

/**
 * Server error
 * @param response
 * @param send
 * @param error
 * @param next
 */
function httpError(response, send, error, next){
  var self = this;
  var url = send.url;
  var status = error.status;
  var pathname = send.pathname;
  var errorpage = self.config.status[status];

  // Logger
  self.logger.warn('Request: ' + url + ' ' + error.message);

  // Not found favicon.ico use default ico
  if (status === 404 && pathname === '/favicon.ico' && pathname !== self.favicon) {
    // Redirect to default favicon
    send.redirect(response, self.favicon);
  } else {
    // Custom error page
    if (typeof errorpage === 'string') {
      fs.exists(path.join(send.root, errorpage), function (exists){
        if (exists) {
          send.redirect(response, errorpage);
        } else {
          defaultStatus.call(self, response, error, next);
        }
      });
    } else {
      // Default error page
      defaultStatus.call(self, response, error, next);
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
 * @param response
 * @param send
 * @param fpath
 * @param next
 */
function viewFolder(response, send, fpath, next){
  var self = this;
  var pathname = send.path;

  // Set Content-Type
  response.setHeader('Content-Type', 'text/html; charset=UTF-8');

  // Read directory
  fs.readdir(fpath, function (error, files){
    // Response
    next(self.res.html['folder'](pathname, files, fpath));
  });
}

/**
 * NengineServer
 * @param options
 * @returns {*}
 * @constructor
 */
function NengineServer(options){
  var logs;
  var logger;
  var pathToRoot;
  var config = mix({}, options);

  // Format params
  config.root = config.root || CWD;
  config.port = config.port || 80;
  config.directory = config.directory || 'deny';
  config.directory = config.directory.toLowerCase();
  config.status = config.status || {};
  this.res = res(config.root);

  // Make log directory
  logs = path.join(config.root, 'logs');

  if (!fs.existsSync(logs)) {
    try {
      fs.mkdirSync(logs);
    } catch (e) {
      console.log(colors.red.bold('Please create "Logs" directory under the root directory.'));
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
  pathToRoot = '/' + httpPath(path.relative(config.root, path.dirname(DIRNAME)));
  this.favicon = httpPath(path.join(pathToRoot, 'favicon.ico'));

  // Return instance
  return this;
}

// Set prototype
NengineServer.prototype = {
  run: function (){
    var self = this;
    var config = self.config;
    var server = config.server;

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
    var fileConfig;
    var help = require('./help');

    // Debug switch
    // Send.debug = options.verbose;

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