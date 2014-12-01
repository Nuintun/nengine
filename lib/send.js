/**
 * nengine
 * https://nuintun.github.io/nengine
 *
 * Licensed under the MIT license
 * https://github.com/Nuintun/nengine/blob/master/LICENSE
 */

'use strict';

var ms = require('ms'),
    fs = require('fs'),
    http = require('http'),
    path = require('path'),
    sep = path.sep,
    join = path.join,
    resolve = path.resolve,
    extname = path.extname,
    normalize = path.normalize,
    mime = require('mime'),
    etag = require('etag'),
    fresh = require('fresh'),
    Stream = require('stream'),
    destroy = require('destroy'),
    debug = require('debug')('Send'),
    onFinished = require('on-finished'),
    escapeHtml = require('escape-html'),
    parseRange = require('range-parser'),
    toString = Object.prototype.toString,
    maxMaxAge = 60 * 60 * 24 * 365 * 1000, // 1 year
    upPathRegexp = /(?:^|[\\\/])\.\.(?:[\\\/]|$)/;

// Expose send
exports = module.exports = send;

// Expose mime module
exports.mime = mime;

// EventEmitter listenerCount
var listenerCount = function (emitter, type){
    return emitter.listeners(type).length;
};

/**
 * Return a `SendStream` for `req` and `path`
 * @param {Object} req
 * @param {String} path
 * @param {Object} options
 * @return {SendStream}
 * @api public
 */
function send(req, path, options){
    return new SendStream(req, path, options);
}

/**
 * Initialize a `SendStream` with the given `path`
 * @param {Object} req
 * @param {String} path
 * @param {Object} options
 * @api private
 */
function SendStream(req, path, options){
    options = options || {};

    // Root
    this._root = options.root
        ? resolve(options.root)
        : null;

    if (this.root === null) {
        throw new TypeError('Root option must be set');
    }

    this.req = req;
    this.path = path;
    this.options = options;

    // Etag
    this._etag = options.etag !== undefined
        ? Boolean(options.etag)
        : true;

    // Dotfiles
    this._dotFiles = typeof options.dotFiles !== 'string'
        ? options.dotfiles
        : 'ignore';

    if (['allow', 'deny', 'ignore'].indexOf(this._dotFiles) === -1) {
        throw new TypeError('Dotfiles option must be "allow", "deny", or "ignore"');
    }

    // Extensions
    this._extensions = options.extensions !== undefined
        ? normalizeList(options.extensions)
        : [];

    // Default document
    this._index = options.index !== undefined
        ? normalizeList(options.index)
        : ['index.html'];

    // Last modified
    this._lastModified = options.lastModified !== undefined
        ? Boolean(options.lastModified)
        : true;

    // Max age
    this._maxAge = options.maxAge || options.maxage;

    this._maxAge = typeof this._maxAge === 'string'
        ? ms(this._maxAge)
        : Number(this._maxAge);

    this._maxAge = !isNaN(this._maxAge)
        ? Math.min(Math.max(0, this._maxAge), maxMaxAge)
        : 0;

    // Directory redirect
    this._dirRedirect = options.dirRedirect !== undefined
        ? Boolean(options.dirRedirect)
        : true;
}

/**
 * Inherits from `Stream.prototype`
 */
SendStream.prototype.__proto__ = Stream.prototype;

/**
 * Emit error with `status`
 * @param {Number} status
 * @param {Error} err
 * @api private
 */
SendStream.prototype.error = function (status, err){
    var res = this.res;
    var msg = http.STATUS_CODES[status];

    // Format err
    err = err || new Error(msg);
    err.status = status;

    // Emit if listeners instead of responding
    if (listenerCount(this, 'error') !== 0) {
        return this.emit('error', err);
    }

    // Wipe all existing headers
    res._headers = undefined;
    // Set status code
    res.statusCode = err.status;
    // Close response
    res.end(msg);
};

/**
 * Check if the pathname ends with "/"
 * @return {Boolean}
 * @api private
 */
SendStream.prototype.hasTrailingSlash = function (){
    return '/' == this.path.slice(-1);
};

/**
 * Check if this is a conditional GET request
 * @return {Boolean}
 * @api private
 */
SendStream.prototype.isConditionalGET = function (){
    return this.req.headers['if-none-match']
        || this.req.headers['if-modified-since'];
};

/**
 * Strip content-* header fields
 * @api private
 */
SendStream.prototype.removeContentHeaderFields = function (){
    var res = this.res;

    // Remove header
    Object.keys(res._headers).forEach(function (field){
        if (0 == field.indexOf('content')) {
            res.removeHeader(field);
        }
    });
};

/**
 * Respond with 304 not modified
 * @api private
 */
SendStream.prototype.notModified = function (){
    var res = this.res;

    // Debug information
    debug('Not modified');

    // Remove content header fields
    this.removeContentHeaderFields();
    // Set status code
    res.statusCode = 304;
    // Close response
    res.end();
};

/**
 * Raise error that headers already sent
 * @api private
 */
SendStream.prototype.headersAlreadySent = function headersAlreadySent(){
    var err = new Error('Can\'t set headers after they are sent');

    // Debug information
    debug('Headers already sent');

    // 500 error
    this.error(500, err);
};

/**
 * Check if the request is cacheable, aka responded with 2xx or 304 (see RFC 2616 section 14.2{5,6})
 * @return {Boolean}
 * @api private
 */
SendStream.prototype.isCachable = function (){
    var res = this.res;

    // Return cache status
    return (res.statusCode >= 200 && res.statusCode < 300) || 304 == res.statusCode;
};

/**
 * Handle stat() error
 * @param {Error} err
 * @api private
 */
SendStream.prototype.onStatError = function (err){
    var notfound = ['ENOENT', 'ENAMETOOLONG', 'ENOTDIR'];

    // 404 error
    if (~notfound.indexOf(err.code)) {
        return this.error(404, err);
    }

    // 500 error
    this.error(500, err);
};

/**
 * Check if the cache is fresh
 * @return {Boolean}
 * @api private
 */
SendStream.prototype.isFresh = function (){
    return fresh(this.req.headers, this.res._headers);
};

/**
 * Check if the range is fresh
 * @return {Boolean}
 * @api private
 */
SendStream.prototype.isRangeFresh = function isRangeFresh(){
    var ifRange = this.req.headers['if-range'];

    // Not range request
    if (!ifRange) return true;

    return ~ifRange.indexOf('"')
        ? ~ifRange.indexOf(this.res._headers['etag'])
        : Date.parse(this.res._headers['last-modified']) <= Date.parse(ifRange);
};

/**
 * Redirect to path
 * @param {String} path
 * @api private
 */
SendStream.prototype.redirect = function (path){
    var res = this.res;
    res.statusCode = 301;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Location', path);
    res.end('Redirecting to <a href="' + escapeHtml(path) + '">' + escapeHtml(path) + '</a>');
};

/**
 * Redirect directory
 * @param {String} path
 * @api private
 */
SendStream.prototype.dirRedirect = function (path){
    // Emit directory listener
    if (listenerCount(this, 'directory') !== 0) {
        return this.emit('directory');
    }

    // Path end with '/'
    if (this.hasTrailingSlash()) {
        return this.error(403);
    }

    // Redirect
    this.dirRedirect(path + '/');
};

/**
 * Pipe to res
 * @param {Stream} res
 * @return {Stream} res
 * @api public
 */
SendStream.prototype.pipe = function (res){
    var parts, access,
        root = this._root,
        path = decode(this.path); // Decode the path

    // References
    this.res = res;

    // Malicious path
    if (upPathRegexp.test(path)) {
        debug('Malicious path "%s"', path);
        return this.error(403)
    }

    if (path === -1) {
        return this.error(400);
    }

    // Null byte(s)
    if (~path.indexOf('\0')) {
        return this.error(400);
    }

    // Join and normalize from optional root dir
    path = normalize(join(root, path));
    root = normalize(root + sep);

    // Malicious path
    if ((path + sep).substr(0, root.length) !== root) {
        debug('Malicious path "%s"', path);

        return this.error(403)
    }

    // Explode path parts
    parts = path.substr(root.length).split(sep);

    // Dotfile handling
    if (containsDotFile(parts)) {
        access = this._dotFiles;

        debug('%s dotfile "%s"', access, path);

        switch (access) {
            case 'allow':
                break;
            case 'deny':
                return this.error(403);
            case 'ignore':
            default:
                return this.error(404);
        }
    }

    // Index file support
    if (this._index.length && this.hasTrailingSlash()) {
        this.sendIndex(path);

        return res;
    }

    this.sendFile(path);

    return res;
};

/**
 * Transfer `path`
 * @param {String} path
 * @param {Object} stat
 * @api public
 */
SendStream.prototype.send = function (path, stat){
    var len = stat.size,
        res = this.res,
        req = this.req,
        options = this.options,
        ranges = req.headers.range,
        offset = options.start || 0;

    if (res._header) {
        // Impossible to send now
        return this.headersAlreadySent();
    }

    debug('Pipe "%s"', path);

    // Set header fields
    this.setHeader(path, stat);

    // Set content-type
    this.type(path);

    // Conditional GET support
    if (this.isConditionalGET()
        && this.isCachable()
        && this.isFresh()) {
        return this.notModified();
    }

    // Adjust len to start/end options
    len = Math.max(0, len - offset);

    if (options.end !== undefined) {
        var bytes = options.end - offset + 1;

        if (len > bytes) {
            len = bytes;
        }
    }

    // Range support
    if (ranges) {
        ranges = parseRange(len, ranges);

        // If-Range support
        if (!this.isRangeFresh()) {
            debug('range stale');
            ranges = -2;
        }

        // Unsatisfiable
        if (-1 == ranges) {
            debug('range unsatisfiable');
            res.setHeader('Content-Range', 'bytes */' + stat.size);

            return this.error(416);
        }

        // Valid (syntactically invalid/multiple ranges are treated as a regular response)
        if (-2 != ranges && ranges.length === 1) {
            debug('range %j', ranges);

            options.start = offset + ranges[0].start;
            options.end = offset + ranges[0].end;

            // Content-Range
            res.statusCode = 206;
            res.setHeader(
                'Content-Range',
                'bytes '
                + ranges[0].start
                + '-'
                + ranges[0].end
                + '/'
                + len
            );

            len = options.end - options.start + 1;
        }
    }

    // Content-length
    res.setHeader('Content-Length', len);

    // HEAD support
    if (req.method === 'HEAD') {
        return res.end();
    }

    this.stream(path, options);
};

/**
 * Transfer file for `path`
 * @param {String} path
 * @api private
 */
SendStream.prototype.sendFile = function sendFile(path){
    var i = 0,
        self = this;

    debug('Stat "%s"', path);

    fs.stat(path, function onstat(err, stat){
        if (err && err.code === 'ENOENT'
            && !extname(path)
            && path[path.length - 1] !== sep) {
            // Not found, check extensions
            return next(err)
        }

        if (err) {
            return self.onStatError(err);
        }

        if (stat.isDirectory()) {
            return self.dirRedirect(self.path);
        }

        self.emit('file', path, stat);
        self.send(path, stat)
    });

    function next(err){
        var _path;

        if (self._extensions.length <= i) {
            return err
                ? self.onStatError(err)
                : self.error(404);
        }

        _path = path + '.' + self._extensions[i++];

        debug('stat "%s"', _path);

        fs.stat(_path, function (err, stat){
            if (err) {
                return next(err);
            }

            if (stat.isDirectory()) {
                return next();
            }

            self.emit('file', _path, stat);
            self.send(_path, stat);
        });
    }
};

/**
 * Transfer index for `path`
 * @param {String} path
 * @api private
 */
SendStream.prototype.sendIndex = function sendIndex(path){
    var i = -1,
        self = this;

    function next(err){
        if (++i >= self._index.length) {
            if (err) {
                return self.onStatError(err);
            }

            return self.error(404);
        }

        var _path = join(path, self._index[i]);

        debug('stat "%s"', _path);

        fs.stat(_path, function (err, stat){
            if (err) {
                return next(err);
            }

            if (stat.isDirectory()) {
                return next();
            }

            self.emit('file', _path, stat);
            self.send(_path, stat);
        });
    }

    next();
};

/**
 * Stream `path` to the response
 * @param {String} path
 * @param {Object} options
 * @api private
 */
SendStream.prototype.stream = function (path, options){
    // TODO: this is all lame, refactor meeee
    var self = this,
        res = this.res,
        req = this.req,
        finished = false,
        stream = fs.createReadStream(path, options);

    // Emit stream
    this.emit('stream', stream);

    // Pipe
    stream.pipe(res);

    // response finished, done with the fd
    onFinished(res, function onfinished(){
        finished = true;
        destroy(stream);
    });

    // error handling code-smell
    stream.on('error', function onerror(err){
        // request already finished
        if (finished) return;

        // clean up stream
        finished = true;
        destroy(stream);

        // error
        self.onStatError(err);
    });

    // end
    stream.on('end', function onend(){
        self.emit('end');
    });
};

/**
 * Set content-type based on `path` if it hasn't been explicitly set
 * @param {String} path
 * @api private
 */

SendStream.prototype.type = function (path){
    var type, charset,
        res = this.res;

    if (res.getHeader('Content-Type')) return;

    type = mime.lookup(path);
    charset = mime.charsets.lookup(type);

    debug('content-type %s', type);

    res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''));
};

/**
 * Set response header fields, most fields may be pre-defined
 * @param {String} path
 * @param {Object} stat
 * @api private
 */
SendStream.prototype.setHeader = function setHeader(path, stat){
    var val, modified,
        res = this.res;

    this.emit('headers', res, path, stat);

    if (!res.getHeader('Accept-Ranges')) {
        res.setHeader('Accept-Ranges', 'bytes');
    }

    if (!res.getHeader('Date')) {
        res.setHeader('Date', new Date().toUTCString());
    }

    if (!res.getHeader('Cache-Control')) {
        res.setHeader(
            'Cache-Control',
            'public, max-age=' + Math.floor(this._maxAge / 1000)
        );
    }

    if (this._lastModified && !res.getHeader('Last-Modified')) {
        modified = stat.mtime.toUTCString();
        debug('modified %s', modified);
        res.setHeader('Last-Modified', modified);
    }

    if (this._etag && !res.getHeader('ETag')) {
        val = etag(stat);
        debug('etag %s', val);
        res.setHeader('ETag', val);
    }
};

/**
 * Determine if path parts contain a dotfile.
 * @api private
 */
function containsDotFile(parts){
    for (var i = 0; i < parts.length; i++) {
        if (parts[i].charAt(0) === '.') {
            return true;
        }
    }

    return false;
}

/**
 * DecodeURIComponent.
 * Allows V8 to only deoptimize this fn instead of all of send()
 * @param {String} path
 * @api private
 */
function decode(path){
    try {
        return decodeURIComponent(path);
    } catch (err) {
        return -1;
    }
}

/**
 * Normalize the index option into an array
 * @param {Boolean|String|Array} val
 * @api private
 */
function normalizeList(val){
    return [].concat(val || []);
}
