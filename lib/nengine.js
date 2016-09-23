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
var https = require('https');
var util = require('./util');
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

  send.setHeader('Server', 'Nengine/' + pkg.version);
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
  var statusCode = error.statusCode;

  // set Content-Type
  send.setHeader('Content-Type', 'text/html; charset=UTF-8');
  next(context.assets.html.error(statusCode, error.message));
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
  var pathname = send.path;
  var statusCode = error.statusCode;
  var errorPage = context.options.error[statusCode];

  // logger
  process.send({
    type: 'warn',
    message: 'Request warn: ' + url + ' ' + error.message
  });

  // not found favicon.ico use default ico
  if (statusCode === 404 && pathname === '/favicon.ico' && pathname !== context.favicon) {
    // redirect to default favicon
    send.redirect(response, context.favicon);
  } else {
    // custom error page
    if (typeof errorPage === 'string') {
      fs.exists(path.join(send.root, errorPage), function (exists){
        if (exists) {
          send.redirect(response, errorPage);
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
  options = util.extend(true, {}, options);

  // format params
  options.root = options.root || CWD;
  options.port = options.port || 80;
  options.error = options.error || {};
  options.ignore = options.ignore ? options.ignore : [];
  options.dir = util.string(options.dir) ? options.dir.toLowerCase() : 'deny';
  options.ignore = Array.isArray(options.ignore) ? options.ignore : [options.ignore];

  // get path program relative to root
  var pathToRoot = path.relative(options.root, path.dirname(DIRNAME));

  // favicon
  this.favicon = posixPath(path.join('/', pathToRoot, 'favicon.ico'));

  // not default access
  if (options.ignore.length) {
    options.ignore.push('!' + this.favicon);
    options.ignore.push('!(/node_modules/**/nengine/assets/(images|fonts|css))/**/*');
  }

  // assets
  this.assets = assets(options.root);

  // options
  this.options = options;

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
      var server;

      // choose http type
      if (options.key && options.cert) {
        server = https;
      } else {
        server = http;
      }

      // create server
      server = server.createServer(function (requset, response){
        // send file
        fileSend.call(context, requset, response);
      });

      // start listening
      server.on('listening', function (){
        var address = server.address();
        var hostname = options.hostname
          ? address.address : '127.0.0.1';

        // logger
        process.send({
          type: 'info',
          message: 'Server thread ' + cluster.worker.id + ' runing at: ' + hostname + ':' + address.port
        });
      });

      // error
      server.on('error', function (error){
        // logger
        process.send({
          type: 'error',
          message: 'Server thread ' + cluster.worker.id + ' failed to start: ' + error.message
        });

        // exit
        process.exit();
      });

      // close
      server.on('close', function (){
        // logger
        process.send({
          type: 'info',
          message: 'Server thread ' + cluster.worker.id + ' closed'
        });

        // exit
        process.exit();
      });

      // listen
      if (options.hostname) {
        server.listen(options.port, options.hostname);
      } else {
        server.listen(options.port);
      }

      // return
      return server;
    }
  }
};

// The module to be exported.
module.exports = NengineServer;
