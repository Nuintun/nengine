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
    send = require('./send'),
    log4js = require('log4js'),
    pkg = require('../package.json'),
    nativeRes = require('../native-assets');

/**
 * File send
 * @param requset
 * @param response
 * @param config
 * @returns {SendStream|*|exports}
 */
function fileSend(requset, response, config){
    var that = this,
        steam = send(requset, response, config);

    // Set headers
    if (that._headersListeners_.length > 0) {
        steam.on('headers', function (res, path, stat){
            that._headersListeners_.forEach(function (fn){
                fn.call(that, res, path, stat);
            });
        });
    }

    // Directory
    steam.on('directory', function (fpath){
        switch (config.directory) {
            case 'allow':
                viewFolder.call(that, this, fpath);
                break;
            case 'deny':
                return steam.error(403);
            case 'ignore':
            default:
                return steam.error(404);
        }
    });

    // Error
    steam.on('error', function (err){
        httpError.call(that, this, err);
    });

    // Send
    steam.pipe();

    return steam;
}

/**
 * Error status
 * @param send
 * @param err
 */
function defaultStatus(send, err){
    var that = this,
        response = send.response;

    // Set status code
    response.statusCode = status;
    // Set Content-Type
    response.setHeader('Content-Type', 'text/html');

    // Not found
    if (err.status === 404) {
        response.end(that.nativeRes.html['404']);
    } else {
        // Other error
        response.end(that.nativeRes.html['default'](response.statusCode, err.message));
    }
}

/**
 * Server error
 * @param send
 * @param err
 */
function httpError(send, err){
    var that = this,
        url = send.path,
        errorpage = that.config.status[status];

    // Logger
    that.logger.warn('Request: ' + url + ' ' + err.message);

    // Not found favicon.ico use default ico
    if (err.status === 404 && url === '/favicon.ico' && url !== that.favicon) {
        // Redirect to default favicon
        send.redirect(that.favicon);
    } else {
        // Custom error page
        if (typeof errorpage === 'string') {
            fs.exists(path.join(send.root, errorpage), function (exists){
                if (exists) {
                    send.redirect(errorpage);
                } else {
                    defaultStatus.call(that, send, err);
                }
            });
        } else {
            // Default error page
            defaultStatus.call(that, send, err);
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
    var that = this,
        dirpath = send.path,
        response = send.response;

    // Read directory
    fs.readdir(fpath, function (err, files){
        if (that.config.dotFiles === 'ignore') {
            files = files.filter(function (path){
                return path.charAt(0) !== '.';
            });
        }

        // Response
        response.end(that.nativeRes.html['folder'](dirpath, files));
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
            return config.log('Please create "Logs" directory in the root directory');
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
    this._headersListeners_ = [];

    return this;
}

NengineServer.prototype = {
    setHeaders: function (fn){
        if (typeof fn === 'function') {
            this._headersListeners_.push(fn);
        }
    },
    run: function (){
        var that = this,
            config = that.config,
            server = config.server;

        // Create server
        var httpServer = http.createServer(function (requset, response){
            if (server) {
                server = server === true ? 'Nengine' + (pkg.version ? '/' + pkg.version : '') : server;
                typeof server === 'string' && response.setHeader('Server', server);
            }

            // Send file
            fileSend.call(that, requset, response, config);
        });

        // Start listening
        httpServer.on('listening', function (){
            that.logger.info('Server runing at port: ' + config.port);
        });

        // Error
        httpServer.on('error', function (err){
            that.logger.error('Server failed to start: ' + err.message);
        });

        // Close
        httpServer.on('close', function (){
            that.logger.info('Server closed');
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