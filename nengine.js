/**
 * Created by Newton on 2014/11/22.
 */
var fs = require('fs'),
    path = require('path'),
    http = require('http'),
    log4js = require('log4js'),
    parseurl = require('parseurl'),
    merge = require('./lib/merge'),
    serveStatic = require('serve-static'),
    nativeAssets = require('./native-assets'),
    defaults = JSON.parse(fs.readFileSync('nengine.json', 'utf-8'));

function defaultStatus(response, err){
    var that = this;

    if (err === null) {
        response.statusCode = 404;
        response.setHeader('Content-Type', 'text/html');
        response.end(that.assets.status['404']);
    } else {
        response.statusCode = err.status || 500;
        response.setHeader('Content-Type', 'text/plain');
        response.end(JSON.stringify(err, null, '&nbsp;&nbsp;'));
    }
}

function nengineError(requset, response, send, err){
    var that = this,
        config = that.config,
        status = err === null ? 404 : err.status;

    response.statusCode = status;

    if (config.status[status]) {
        requset.url = config.status[status];

        send(requset, response, function (err){
            defaultStatus.call(that, response, err);
        });
    } else {
        if (status === 404) {
            that.logger.warn('Resource not found: ' + requset.url);
            response.setHeader('Content-Type', 'text/html');
            response.end(that.assets.html['404']);
        } else {
            that.logger.error('Server error: ' + err.message);
            response.setHeader('Content-Type', 'text/plain');
            response.end(JSON.stringify(err, null, '&nbsp;&nbsp;'));
        }
    }
}

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
        response.end(that.assets.html['folder']({
            files: files,
            dirpath: dirpath
        }));
    });
}

function Nengine(options){
    var logger,
        config = merge(defaults, options);

    config.root = config.root || process.cwd();
    this.assets = nativeAssets(config.root);

    log4js.loadAppender('file');
    log4js.addAppender(log4js.appenders.file(path.join(config.root, 'nengine.log')), 'Nengine');

    logger = log4js.getLogger('Nengine');
    logger.setLevel(config.logger);

    this.logger = logger;
    this.config = config;
}

Nengine.prototype = {
    run: function (){
        var that = this,
            config = that.config,
            send = serveStatic(config.root, config);

        // Create server
        var httpServer = http.createServer(function (requset, response){
            response.setHeader('Server', config.server);

            that.logger.trace('Resource request: ' + requset.url);

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

        httpServer.listen(config.port, '127.0.0.1');

        that.logger.info('Server runing at port: ' + config.port);
    }
};

new Nengine().run();