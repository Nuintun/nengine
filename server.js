/**
 * Created by Newton on 2014/11/22.
 */
var fs = require('fs'),
    cwd = process.cwd(),
    dirname = __dirname,
    path = require('path'),
    http = require('http'),
    log4js = require('log4js'),
    parseurl = require('parseurl'),
    merge = require('./lib/merge'),
    serveStatic = require('serve-static'),
    nengineAssets = require('./nengine-assets'),
    defaults = JSON.parse(fs.readFileSync(path.join(dirname, 'nengine.json'), 'utf-8')),
    version = JSON.parse(fs.readFileSync(path.join(dirname, 'package.json'), 'utf-8')).version;

// 调用内置状态页
function defaultStatus(requset, response, err){
    var message,
        that = this;

    response.setHeader('Content-Type', 'text/html');

    if (err === null) {
        message = 'Not Found';

        that.logger.warn('Request: ' + requset.url + ' >>> ' + message);

        response.statusCode = 404;
        response.end(that.assets.html['404']);
    } else {
        message = err.message || 'Nengine Server Error';

        that.logger.warn('Request: ' + requset.url + ' >>> ' + message);

        response.statusCode = err.status || 500;
        response.end(that.assets.html['default'](response.statusCode, message));
    }
}

// 服务器错误
function nengineError(requset, response, send, err){
    var that = this,
        config = that.config,
        status = err === null ? 404 : err.status;

    response.statusCode = status;

    if (config.status[status]) {
        requset.url = config.status[status];

        send(requset, response, function (err){
            defaultStatus.call(that, requset, response, err);
        });
    } else {
        defaultStatus.call(that, requset, response, err);
    }
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

function Nengine(options){
    var logger,
        config = merge(defaults, options);

    config.root = config.root || cwd;
    this.assets = nengineAssets(config.root);

    log4js.loadAppender('file');
    log4js.addAppender(log4js.appenders.file(path.join(config.root, 'nengine.log')), 'Nengine');

    logger = log4js.getLogger('Nengine');
    logger.setLevel(config.logger);

    this.logger = logger;
    this.config = config;

    return this;
}

Nengine.prototype = {
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
                server = server === true ? 'Nengine' + (version ? '/' + version : '') : server;
                typeof server === 'string' && response.setHeader('Server', server);
            }

            that.logger.trace('Request: ' + requset.url);

            send(requset, response, function (err){
                if (config.redirect || err !== undefined) {
                    nengineError.call(that, requset, response, send, err);
                } else {
                    if (err === null) {
                        nengineError.call(that, requset, response, send, err);
                    } else {
                        viewFolder.call(that, requset, response);
                    }
                }
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

module.exports = Nengine;