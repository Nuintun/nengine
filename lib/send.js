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
    root = process.cwd(),
    http = require('http'),
    path = require('path'),
    sep = path.sep,
    join = path.join,
    resolve = path.resolve,
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
    MAXMAXAGE = 60 * 60 * 24 * 365 * 1000, // The max maxAge set
    BACKSLASHRE = /\\/g, // Backslash
    DOTFILERE = /^\.|[\\/]\.[^.\\/]/g, // Is dot file or directory
    UPPATHRE = /(?:^|[\\\/])\.\.(?:[\\\/]|$)/; // Parent path

/**
 * Date type judgment
 * @param data
 * @param type
 * @returns {boolean}
 */
function isType(data, type){
    // Get real type
    var realType = toString.call(data).toLowerCase();

    // Format type
    type = type.toString().toLowerCase();

    // Is NaN
    if (type === 'nan') {
        return !!(realType === '[object number]' && data !== data);
    }

    // Return
    return realType === '[object ' + type + ']';
}

/**
 * Format path to http style
 * @param path
 * @returns {XML|string|void}
 */
function formatPath(path){
    BACKSLASHRE.lastIndex = 0;
    return normalize(path).replace(BACKSLASHRE, '/');
}

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
    var range,  // File range
        maxAge; // Max age

    // Set req property
    this.req = req;

    // Format path
    path = isType(path, 'string') ? path : '/';

    BACKSLASHRE.lastIndex = 0;
    this.path = formatPath(path);

    // Format options
    options = options || {};

    // Root
    this.root = isType(options.root, 'string')
        ? resolve(options.root)
        : root;

    this.root = formatPath(this.root + sep);

    // Clean options
    delete options.root;

    // Etag
    this.etag = options.etag !== undefined
        ? Boolean(options.etag)
        : true;

    // Clean options
    delete options.etag;

    // Dotfiles
    this.dotFiles = isType(options.dotFiles, 'string')
        ? options.dotFiles
        : 'ignore';

    if (['allow', 'deny', 'ignore'].indexOf(this.dotFiles) === -1) {
        throw new TypeError('Dotfiles option must be "allow", "deny", or "ignore"');
    }

    // Clean options
    delete options.dotFiles;

    // Extensions
    this.extensions = normalizeList(options.extensions);

    // Clean options
    delete options.extensions;

    // Default document
    this.index = isType(options.index, 'array') || isType(options.index, 'string')
        ? normalizeList(options.index)
        : ['index.html'];

    // Clean options
    delete options.index;

    // Last modified
    this.lastModified = options.lastModified !== undefined
        ? Boolean(options.lastModified)
        : true;

    // Clean options
    delete options.lastModified;

    // Max age
    maxAge = options.maxAge;

    maxAge = isType(maxAge, 'string')
        ? ms(maxAge)
        : Number(maxAge);

    this.maxAge = isType(maxAge, 'number')
        ? Math.min(Math.max(0, maxAge), MAXMAXAGE)
        : 0;

    // Clean options
    delete options.maxAge;

    // File range
    range = options.range;
    range = isType(range, 'array') ? options.range : [0];

    // Range start
    range[0] = isType(range[0], 'number') && range[0] >= 0
        ? range[0]
        : 0;

    // Range end
    range[1] = isType(range[1], 'number') && range[1] >= range[0]
        ? range[1]
        : undefined;

    this.range = range;

    // Clean options
    delete options.range;

    // Set other property
    this.options = options;
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
    err = err instanceof Error ? err : new Error(msg);
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
 * Strip Content-* header fields
 * @api private
 */
SendStream.prototype.removeContentHeaderFields = function (){
    var res = this.res;

    // Remove header
    Object.keys(res._headers).forEach(function (field){
        if (0 == field.toLowerCase().indexOf('content')) {
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

    // Response
    res.statusCode = 301;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Location', path);
    res.end('Redirecting to <a href="' + escapeHtml(path) + '">' + escapeHtml(path) + '</a>');
};

/**
 * Pipe to res
 * @param {Stream} res
 * @return {Stream} res
 * @api public
 */
SendStream.prototype.pipe = function (res){
    var dotFile,
        req = this.req,
        root = this.root,
        path = decode(this.path); // Decode the path

    // Requset method not support
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        this.error(405);
    }

    // References
    this.res = res;

    // Malicious path
    if (UPPATHRE.test(path)) {
        debug('Malicious path "%s"', path);
        return this.error(403)
    }

    // Path error
    if (path === -1) {
        return this.error(400);
    }

    // Null byte(s)
    if (~path.indexOf('\0')) {
        return this.error(400);
    }

    // Join and normalize from optional root dir
    path = formatPath(join(root, path));

    // Malicious path
    if (formatPath(path + sep).substr(0, root.length) !== root) {
        debug('Malicious path "%s"', path);

        // 403
        return this.error(403);
    }

    // Dotfile handling
    if (containsDotFile(path)) {
        dotFile = this.dotFiles;

        debug('%s dotfile "%s"', dotFile, path);

        // Dot files access
        switch (dotFile) {
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
    if (this.index.length && this.hasTrailingSlash()) {
        this.sendIndex(path);

        // Return response
        return res;
    }

    // Send files
    this.sendFile(path);

    // Return response
    return res;
};

/**
 * Transfer `path`
 * @param {String} path
 * @param {Object} stat
 * @api public
 */
SendStream.prototype.send = function (path, stat){
    var bytes,
        len = stat.size,
        res = this.res,
        req = this.req,
        options = this.options,
        ranges = req.headers.range,
        offset = this.range[0],
        rangeEnd = this.range[1];

    if (res.headersSent) {
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

    if (rangeEnd !== undefined) {
        bytes = rangeEnd - offset + 1;

        if (len > bytes) {
            len = bytes;
        }
    }

    // Range support
    if (ranges) {
        ranges = parseRange(len, ranges);

        // If-Range support
        if (!this.isRangeFresh()) {
            debug('Range stale');
            ranges = -2;
        }

        // Unsatisfiable
        if (-1 == ranges) {
            debug('Range unsatisfiable');
            res.setHeader('Content-Range', 'bytes */' + stat.size);

            return this.error(416);
        }

        // Valid (syntactically invalid/multiple ranges are treated as a regular response)
        if (-2 !== ranges && ranges.length === 1) {
            debug('Range %j', ranges);

            this.range[0] = offset + ranges[0].start;
            this.range[1] = offset + ranges[0].end;

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

            len = this.range[1] - this.range[0] + 1;
        }
    }

    // Content-length
    res.setHeader('Content-Length', len);

    // HEAD support
    if (req.method === 'HEAD') {
        return res.end();
    }

    // Send
    this.stream(path, options);
};

/**
 * Transfer file for path
 * @param {String} path
 * @api private
 */
SendStream.prototype.sendFile = function sendFile(path){
    var i = 0,
        pathStat,
        self = this,
        extensions = self.extensions,
        length = extensions.length;

    debug('Stat "%s"', path);

    /**
     * Send helper
     * @param stat
     * @returns {*}
     */
    function send(stat){
        if (stat.isDirectory()) {
            if (self.hasTrailingSlash()) {
                if (listenerCount(self, 'directory') > 0) {
                    return self.emit('directory', path, stat);
                } else {
                    return self.error(403);
                }
            } else {
                return self.redirect(self.path + '/');
            }
        }

        self.emit('file', path, stat);
        self.send(path, stat);
    }

    // Stat
    fs.stat(path, function onstat(err, stat){
        pathStat = stat;

        // Check extensions
        if (length > 0
            && !self.hasTrailingSlash()) {
            return next(err);
        }

        // Error
        if (err) {
            return self.onStatError(err);
        }

        // Send
        send(stat);
    });

    /**
     * Loop extensions
     * @param err
     * @returns {*}
     */
    function next(err){
        var _path;

        if (i >= length) {
            if (pathStat) {
                return send(pathStat);
            } else {
                return err
                    ? self.onStatError(err)
                    : self.error(404);
            }
        }

        // Add extensions
        _path = path + '.' + extensions[i++];

        debug('Stat "%s"', _path);

        // Stat
        fs.stat(_path, function (err, stat){
            // Error
            if (err) {
                return next(err);
            }

            // Is directory
            if (stat.isDirectory()) {
                return next();
            }

            // Send
            self.emit('file', _path, stat);
            self.send(_path, stat);
        });
    }
};

/**
 * Transfer index for path
 * @param {String} path
 * @api private
 */
SendStream.prototype.sendIndex = function sendIndex(path){
    var i = 0,
        pathStat,
        self = this,
        index = self.index,
        length = index.length;

    // Stat
    fs.stat(path, function (err, stat){
        // Error
        if (err) {
            return self.onStatError(err);
        }

        // Cache stat
        pathStat = stat;

        // Loop index
        next(err);
    });

    /**
     * Loop index
     * @returns {*}
     */
    function next(){
        var _path;

        // Loop end
        if (i >= length) {
            if (listenerCount(self, 'directory') > 0) {
                return self.emit('directory', path, pathStat);
            } else {
                return self.error(403);
            }
        }

        // Add index
        _path = path + index[i++];

        debug('Stat "%s"', _path);

        // Stat
        fs.stat(_path, function (err, stat){
            // Error
            if (err) {
                return next();
            }

            // Is directory
            if (stat.isDirectory()) {
                return next();
            }

            // Send
            self.emit('file', _path, stat);
            self.send(_path, stat);
        });
    }
};

/**
 * Stream path to the response
 * @param {String} path
 * @param {Object} options
 * @api private
 */
SendStream.prototype.stream = function (path, options){
    // TODO: this is all lame, refactor meeee
    var self = this,
        res = this.res,
        finished = false,
        stream = fs.createReadStream(path, options);

    // Emit stream
    this.emit('stream', stream);

    // Pipe
    stream.pipe(res);

    // Response finished, done with the fd
    onFinished(res, function onfinished(){
        finished = true;

        // Destroy stream
        destroy(stream);
    });

    // Error handling code-smell
    stream.on('error', function onerror(err){
        // Request already finished
        if (finished) return;

        // Clean up stream
        finished = true;

        // Destroy stream
        destroy(stream);

        // Error
        self.onStatError(err);
    });

    // End
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

    // Already set Content-Type
    if (res.getHeader('Content-Type')) return;

    // Get MIME
    type = mime.lookup(path);
    charset = mime.charsets.lookup(type);

    debug('Content-Type %s', type);

    // Set Content-Type
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

    // Set Accept-Ranges
    if (!res.getHeader('Accept-Ranges')) {
        res.setHeader('Accept-Ranges', 'bytes');
    }

    // Set Date
    if (!res.getHeader('Date')) {
        res.setHeader('Date', new Date().toUTCString());
    }

    // Set Cache-Control
    if (!res.getHeader('Cache-Control')) {
        res.setHeader(
            'Cache-Control',
            'public, max-age=' + Math.floor(this.maxAge / 1000)
        );
    }

    // Set Last-Modified
    if (this.lastModified && !res.getHeader('Last-Modified')) {
        modified = stat.mtime.toUTCString();

        debug('Modified %s', modified);
        res.setHeader('Last-Modified', modified);
    }

    // Set ETag
    if (this.etag && !res.getHeader('ETag')) {
        val = etag(stat);

        debug('ETag %s', val);
        res.setHeader('ETag', val);
    }
};

/**
 * Determine if path parts contain a dotfile.
 * @api private
 */

function containsDotFile(path){
    // Reset DOTFILERE math index
    DOTFILERE.lastIndex = 0;
    return DOTFILERE.test(path);
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
 * @param {String|Array} data
 * @api private
 */
function normalizeList(data){
    var list = [],
        type = toString.call(data);

    // Data is string
    if (type === '[object String]') {
        list.push(data);
    }

    // Data is array
    if (type === '[object Array]') {
        list = list.concat(data.filter(function (item){
            return isType(item, 'string');
        }));
    }

    // Return list
    return list;
}
