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
    merge = require('./merge'),
    log4js = require('log4js'),
    parseurl = require('parseurl'),
    pkg = require('./../package.json'),
    serveStatic = require('./serve-static'),
    defaultConfig = require('./../nengine.json'),
    nengineAssets = require('./../nengine-assets/index');

// 调用内置状态页
function defaultStatus(requset, response, send, err){
    var message,
        that = this;

    //文件未找到
    if (err.status === 404) {
        // 如果根目录没有 favicon.ico，则使用内置的图标
        if (requset.url === '/favicon.ico' && requset.pathToRoot !== '/') {
            requset.url = that.favicon;

            send(requset, response, function (err){
                defaultStatus.call(that, requset, response, send, err);
            });
        } else {
            message = 'Not Found';

            that.logger.warn('Request: ' + requset.url + ' ' + message);

            response.statusCode = 404;
            response.setHeader('Content-Type', 'text/html');
            response.end(that.assets.html['404']);
        }
    } else {
        // 服务器出错
        message = err.message || 'Nengine Server Error';

        that.logger.warn('Request: ' + requset.url + ' ' + message);

        response.statusCode = err.status || 500;
        response.setHeader('Content-Type', 'text/html');
        response.end(that.assets.html['default'](response.statusCode, message));
    }
}

// 服务器错误
function nengineError(requset, response, send, err){
    var that = this,
        config = that.config,
        status = err.status;

    response.statusCode = status;

    if (config.status[status]) {
        requset.url = config.status[status];

        send(requset, response, function (err){
            defaultStatus.call(that, requset, response, send, err);
        });
    } else {
        defaultStatus.call(that, requset, response, send, err);
    }
}

// 转换路径到http格式的路径
function httpPath(path){
    return path.replace(/\\/g, '/');
}

// 显示文件夹目录
function viewFolder(requset, response){
    var that = this,
        config = that.config,
        dirpath, originalUrl, hasTrailingSlash;

    dirpath = parseurl(requset).pathname;
    originalUrl = parseurl.original(requset);
    hasTrailingSlash = originalUrl.pathname[originalUrl.pathname.length - 1] === '/';

    if (dirpath === '/' && !hasTrailingSlash) {
        // make sure redirect occurs at mount
        dirpath = '';
    }

    fs.readdir(path.join(config.root, dirpath), function (err, files){
        response.end(that.assets.html['folder'](dirpath, files));
    });
}

function NengineServer(options){
    var logger,
        config = merge(defaultConfig, options);

    config.root = config.root || cwd;
    this.assets = nengineAssets(config.root);

    log4js.loadAppender('file');
    log4js.addAppender(log4js.appenders.file(path.join(config.root, 'nengine.log')), 'Nengine');

    logger = log4js.getLogger('Nengine');
    logger.setLevel(config.logger);

    this.logger = logger;
    this.config = config;
    this.pathToRoot = '/' + httpPath(path.relative(config.root, dirname));
    this.favicon = httpPath(path.join(this.pathToRoot, 'favicon.ico').replace(/\\/g, '/'));

    return this;
}

NengineServer.prototype = {
    setHeader: function (callback){
        if (typeof callback === 'function') {
            this.config['setHeaders'] = callback;
        }

        return this;
    },
    run: function (){
        var that = this,
            config = that.config,
            server = config.server,
            send = serveStatic(config.root, config);

        // Create server
        var httpServer = http.createServer(function (requset, response){
            if (server) {
                server = server === true ? 'Nengine' + (pkg.version ? '/' + pkg.version : '') : server;
                typeof server === 'string' && response.setHeader('Server', server);
            }

            send(requset, response, function (err){
                if (!config.redirect && err === 'directory') {
                    viewFolder.call(that, requset, response);
                } else {
                    nengineError.call(that, requset, response, send, err);
                }
            }).on('end', function (){
                that.logger.trace('Request: ' + requset.url);
            });
        });

        httpServer.on('listening', function (){
            that.logger.info('Server runing at port: ' + config.port);
        });

        httpServer.on('error', function (err){
            that.logger.error('Server failed to start: ' + err.message);
        });

        httpServer.on('close', function (){
            that.logger.info('Server closed');
        });

        httpServer.listen(config.port);

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
        var help = require('./help'),
            fileConfig = path.join(cwd, 'nengine.json');

        if (fs.existsSync(fileConfig)) {
            fileConfig = require(fileConfig);
        } else {
            fileConfig = defaultConfig;
        }

        if (options.version) {
            help.version();
        }

        if (options.help) {
            help.help();
            process.exit();
        }

        if (!cmd.length || cmd[0] === 'run') {
            return this.create(merge(fileConfig, options)).run();
        }

        return this;
    }
};