/**
 * nengine
 * https://nuintun.github.io/nengine
 *
 * Licensed under the MIT license
 * https://github.com/Nuintun/nengine/blob/master/LICENSE
 */

'use strict';

// external lib
var os = require('os');
var fs = require('fs');
var path = require('path');
var http = require('http');
var mix = require('./mix');
var log4js = require('log4js');
var Send = require('file-send');
var pkg = require('../package.json');
var assets = require('../assets');
var cluster = require('cluster');

// variable declaration
var DIRNAME = __dirname;
var NUMCPUS = os.cpus().length;

/**
 * file send
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
    // error
    send.on('headers', function (headers){
      process.send({
        type: 'debug',
        message: 'Request and Response status:'
        + '\r\nURL      : ' + send.url
        + '\r\nPATH     : ' + send.path
        + '\r\nROOT     : ' + send.root
        + '\r\nREALPATH : ' + send.realpath
        + '\r\nSTATUS   : ' + send.statusCode
        + '\r\nHEADERS  : ' + JSON.stringify(headers, null, 2)
      });
    });
  }

  // dir
  send.on('dir', function (fpath, stats, next){
    switch (options.dir) {
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

  // error
  send.on('error', function (error, next){
    httpError.call(context, response, send, error, next);
  });

  // send
  return send.pipe(response);
}

/**
 * default status
 * @param send
 * @param error
 * @param next
 */
function defaultStatus(send, error, next){
  var context = this;
  var status = error.statusCode;

  // set Content-Type
  send.setHeader('Content-Type', 'text/html; charset=UTF-8');
  next(context.assets.html.error(status, error.message));
}

/**
 * server error
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

  // logger
  process.send({
    type: 'warn',
    message: 'Request warn: ' + url + ' ' + error.message
  });

  // not found favicon.ico use default ico
  if (status === 404 && pathname === '/favicon.ico' && pathname !== context.favicon) {
    // redirect to default favicon
    send.redirect(response, context.favicon);
  } else {
    // custom error page
    if (typeof errorpage === 'string') {
      fs.exists(path.join(send.root, errorpage), function (exists){
        if (exists) {
          send.redirect(response, errorpage);
        } else {
          defaultStatus.call(context, send, error, next);
        }
      });
    } else {
      // default error page
      defaultStatus.call(context, send, error, next);
    }
  }
}

/**
 * format to posix path style
 * @param path
 * @returns {XML|*|string|void}
 */
function posixPath(path){
  return path.replace(/\\/g, '/');
}

/**
 * view folder
 * @param response
 * @param send
 * @param fpath
 * @param next
 */
function viewFolder(response, send, fpath, next){
  var context = this;
  var pathname = send.path;

  // set Content-Type
  send.setHeader('Content-Type', 'text/html; charset=UTF-8');

  // read dir
  fs.readdir(fpath, function (error, files){
    if (error) {
      send.statError(response, error);
    } else {
      // ignore matched
      if (context.options.ignoreAccess === 'ignore') {
        files = files.filter(function (file){
          return !send.isIgnore(pathname + file);
        });
      }

      // response
      next(context.assets.html.dir(pathname, files, fpath));
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
  options = mix({}, options);

  // format params
  options.root = options.root || CWD;
  options.port = options.port || 80;
  options.status = options.status || {};
  options.dir = options.dir || 'deny';
  options.dir = options.dir.toLowerCase();

  this.assets = assets(options.root);
  this.options = options;

  // get path program relative to root
  var pathToRoot = path.relative(options.root, path.dirname(DIRNAME));

  // favicon
  this.favicon = posixPath(path.join('/', pathToRoot, 'favicon.ico'));

  // return instance
  return this;
}

// set prototype
NengineServer.prototype = {
  run: function (){
    var context = this;
    var options = context.options;

    if (cluster.isMaster) {
      // make log dir
      var logs = path.join(options.root, 'logs/');

      if (!fs.existsSync(logs)) {
        try {
          fs.mkdirSync(logs);
        } catch (e) {
          // logger
          process.send({
            type: 'error',
            message: 'Please create "Logs" directory under the root directory'
          });

          // exit process
          process.exit();
        }
      }

      // configure log4js
      log4js.configure({
        appenders: [
          {
            type: 'console'
          },
          {
            filename: logs,
            absolute: true,
            type: 'dateFile',
            category: 'Nengine-Server',
            alwaysIncludePattern: true,
            pattern: 'yyyy-MM-dd.txt'
          }
        ]
      });

      // get logger
      var logger = log4js.getLogger('Nengine-Server');

      // set level
      logger.setLevel('ALL');

      // worker
      var worker;

      // create thread
      for (var i = 0; i < NUMCPUS; i++) {
        // fork
        worker = cluster.fork();

        // listen event
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

        // set server name
        options.server = server;
      }

      // create server
      var httpServer = http.createServer(function (requset, response){
        // send file
        fileSend.call(context, requset, response);
      });

      // start listening
      httpServer.on('listening', function (){
        // logger
        process.send({
          type: 'info',
          message: 'Server thread ' + cluster.worker.id + ' runing at: ' + options.hostname + ':' + options.port
        });
      });

      // error
      httpServer.on('error', function (error){
        // logger
        process.send({
          type: 'error',
          message: 'Server thread ' + cluster.worker.id + ' failed to start: ' + error.message
        });

        // exit
        process.exit();
      });

      // close
      httpServer.on('close', function (){
        // logger
        process.send({
          type: 'info',
          message: 'Server thread ' + cluster.worker.id + ' closed'
        });

        // exit
        process.exit();
      });

      // listen
      httpServer.listen(options.port, options.hostname || '127.0.0.1');

      // return
      return httpServer;
    }
  }
};

// The module to be exported.
module.exports = NengineServer;