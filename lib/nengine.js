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
    defaultConfig = require('../nengine.json'),
    nengineAssets = require('../native-assets');

function fileSend(requset, response, config){
    var that = this,
        steam = send(requset, response, config);

    steam.on('directory', function (fpath){
        viewFolder.call(that, this, fpath);
    });

    steam.on('error', function (err){
        httpError.call(that, this, err);
    });

    steam.on('end', function (){
        //that.logger.debug('Request: ' + requset.url);
    });

    steam.pipe();

    return steam;
}

// 调用内置状态页
function defaultStatus(send, err){
    var message,
        favicon,
        that = this,
        requset = send.requset,
        response = send.response;

    //文件未找到
    if (err.status === 404) {
        // 如果根目录没有 favicon.ico，则使用内置的图标
        if (requset.url === '/favicon.ico' && that.pathToRoot !== '/') {
            that.logger.warn('Request: /favicon.ico Not Found');

            favicon = path.join(send.root, that.favicon);

            fs.existsSync(favicon, function (){
                requset.url = that.favicon;

                fileSend.call(that, requset, response, that.config);
            });
        } else {
            message = 'Not Found';

            that.logger.warn('Request: ' + requset.url + ' ' + message);

            response.statusCode = 404;
            response.setHeader('Content-Type', 'text/html');
            response.end(that.nativeRes.html['404']);
        }
    } else {
        // 服务器出错
        message = err.message || 'Nengine Server Error';

        that.logger.warn('Request: ' + requset.url + ' ' + message);

        response.statusCode = err.status || 500;
        response.setHeader('Content-Type', 'text/html');
        response.end(that.nativeRes.html['default'](response.statusCode, message));
    }
}

// 服务器错误
function httpError(send, err){
    var that = this,
        config = that.config,
        status = err.status,
        requset = send.requset,
        response = send.response;

    response.statusCode = status;

    if (config.status[status]) {
        requset.url = config.status[status];

        send(requset, response, function (err){
            defaultStatus.call(that, send, err);
        });
    } else {
        defaultStatus.call(that, send, err);
    }
}

// 转换路径到http格式的路径
function httpPath(path){
    return path.replace(/\\/g, '/');
}

// 显示文件夹目录
function viewFolder(send, fpath){
    var that = this,
        dirpath = send.path,
        response = send.response;

    fs.readdir(fpath, function (err, files){
        response.end(that.nativeRes.html['folder'](dirpath, files));
    });
}

function NengineServer(options){
    var logger,
        config = mix(defaultConfig, options);

    config.root = config.root || cwd;
    this.nativeRes = nengineAssets(config.root);

    log4js.loadAppender('file');
    log4js.addAppender(log4js.appenders.file(path.join(config.root, 'nengine.log')), 'Nengine');

    logger = log4js.getLogger('Nengine');
    logger.setLevel(config.logger);

    this.logger = logger;
    this.config = config;
    this.pathToRoot = '/' + httpPath(path.relative(config.root, path.dirname(dirname)));
    this.favicon = httpPath(path.join(this.pathToRoot, 'favicon.ico').replace(/\\/g, '/'));

    return this;
}

NengineServer.prototype = {
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

            fileSend.call(that, requset, response, config);
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

            // Clean
            delete fileConfig.root;
        } else {
            fileConfig = defaultConfig;
        }

        if (options.version) {
            help.version(options.verbose);
        }

        if (options.help) {
            help.help();
            process.exit();
        }

        if (!cmd.length || cmd[0] === 'run') {
            return this.create(mix(fileConfig, options)).run();
        }

        return this;
    }
};