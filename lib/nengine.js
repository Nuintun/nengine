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
var log4js = require('log4js');
var Send = require('file-send');
var pkg = require('../package.json');
var assets = require('../assets');
var cluster = require('cluster');
var NUMCPUS = require('os').cpus().length;

// Variable declaration
var DIRNAME = __dirname;

/**
 * File send
 * @param requset
 * @param response
 * @returns {*}
 */
function fileSend(requset, response){
  var context = this;
  var options = context.options;
  var send = new Send(requset, options);

  if (options.server) {
    send.setHeader('Server', options.server);
  }

  send.setHeader('X-Powered-By', 'Node/' + process.version);

  if (options.verbose) {
    // Error
    send.on('headers', function (headers){
      // Logger
      process.send({
        type: 'debug',
        message: JSON.stringify(headers, null, 2)
      });
    });
  }

  // Directory
  send.on('dir', function (fpath, stats, next){
    switch (options.directory) {
      case 'allow':
        viewFolder.call(context, response, send, fpath, next);
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
    httpError.call(context, response, send, error, next);
  });

  // Send
  return send.pipe(response);
}

/**
 * Error status
 * @param send
 * @param error
 * @param next
 */
function defaultStatus(send, error, next){
  var context = this;
  var status = error.statusCode;

  // Set Content-Type
  send.setHeader('Content-Type', 'text/html; charset=UTF-8');
  next(context.assets.html['default'](status, error.message));
}

/**
 * Server error
 * @param response
 * @param send
 * @param error
 * @param next
 */
function httpError(response, send, error, next){
  var context = this;
  var url = send.url;
  var status = error.status;
  var pathname = send.pathname;
  var errorpage = context.options.status[status];

  // Logger
  process.send({
    type: 'warn',
    message: 'Request: ' + url + ' ' + error.message
  });

  // Not found favicon.ico use default ico
  if (status === 404 && pathname === '/favicon.ico' && pathname !== context.favicon) {
    // Redirect to default favicon
    send.redirect(response, context.favicon);
  } else {
    // Custom error page
    if (typeof errorpage === 'string') {
      fs.exists(path.join(send.root, errorpage), function (exists){
        if (exists) {
          send.redirect(response, errorpage);
        } else {
          defaultStatus.call(context, send, error, next);
        }
      });
    } else {
      // Default error page
      defaultStatus.call(context, send, error, next);
    }
  }
}

/**
 * Format to http style
 * @param path
 * @returns {XML|*|string|void}
 */
function posixPath(path){
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
  var context = this;
  var pathname = send.path;

  // Set Content-Type
  send.setHeader('Content-Type', 'text/html; charset=UTF-8');

  // Read directory
  fs.readdir(fpath, function (error, files){
    if (error) {
      send.error(response, 403);
    } else {
      // Response
      next(context.assets.html['folder'](pathname, files, fpath));
    }
  });
}

/**
 * NengineServer
 * @param options
 * @returns {*}
 * @constructor
 */
function NengineServer(options){
  var pathToRoot;

  options = mix({}, options);

  // Format params
  options.root = options.root || CWD;
  options.port = options.port || 80;
  options.directory = options.directory || 'deny';
  options.directory = options.directory.toLowerCase();
  options.status = options.status || {};

  this.assets = assets(options.root);
  this.options = options;

  // Get path program relative to root
  pathToRoot = path.relative(options.root, path.dirname(DIRNAME));

  // Favicon
  this.favicon = posixPath(path.join('/', pathToRoot, 'favicon.ico'));

  // Return instance
  return this;
}

// Set prototype
NengineServer.prototype = {
  run: function (){
    var context = this;
    var options = context.options;

    if (cluster.isMaster) {
      var logs;
      var logger;
      var worker;

      // Make log directory
      logs = path.join(options.root, 'logs/');

      if (!fs.existsSync(logs)) {
        try {
          fs.mkdirSync(logs);
        } catch (e) {
          // Logger
          process.send({
            type: 'error',
            message: 'Please create "Logs" directory under the root directory'
          });

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
            filename: logs,
            absolute: true,
            type: 'dateFile',
            category: 'Nengine',
            alwaysIncludePattern: true,
            pattern: 'yyyy-MM-dd.txt'
          }
        ]
      });

      // Get logger
      logger = log4js.getLogger('Nengine');

      // Set level
      logger.setLevel('ALL');

      // Create thread
      for (var i = 0; i < NUMCPUS; i++) {
        worker = cluster.fork();

        worker.on('message', function (data){
          logger[data.type](data.message);
        });
      }
    } else {
      var server = options.server;

      if (server !== false) {
        server = typeof server === 'string'
          ? server
          : 'Nengine' + (pkg.version ? '/' + pkg.version : '');

        // Set server name
        options.server = server;
      }

      // Create server
      var httpServer = http.createServer(function (requset, response){
        // Send file
        fileSend.call(context, requset, response);
      });

      // Start listening
      httpServer.on('listening', function (){
        // Logger
        process.send({
          type: 'info',
          message: 'Server thread ' + cluster.worker.id + ' runing at port: ' + options.port
        });
      });

      // Error
      httpServer.on('error', function (error){
        // Logger
        process.send({
          type: 'error',
          message: 'Server thread ' + cluster.worker.id + ' failed to start: ' + error.message
        });

        // Exit
        process.exit();
      });

      // Close
      httpServer.on('close', function (){
        // Logger
        process.send({
          type: 'info',
          message: 'Server thread ' + cluster.worker.id + ' closed'
        });

        // Exit
        process.exit();
      });

      // Listen
      httpServer.listen(options.port, options.hostname || '127.0.0.1');

      // Return
      return httpServer;
    }
  }
};

// The module to be exported.
module.exports = NengineServer;