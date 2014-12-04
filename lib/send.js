/**
 * nengine
 * https://nuintun.github.io/nengine
 *
 * Licensed under the MIT license
 * https://github.com/Nuintun/nengine/blob/master/LICENSE
 */

'use strict';

var listenerCount, // Get EventEmitter listenerCount
    ms = require('ms'),
    fs = require('fs'),
    root = process.cwd(),
    mix = require('./mix'),
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
    debug = require('./debug'),
    debugTimestamp = debug.timestamp(),
    debugRequest = debug('Request ', debugTimestamp),
    debugResponse = debug('Response', debugTimestamp),
    onFinished = require('on-finished'),
    escapeHtml = require('escape-html'),
    parseRange = require('range-parser'),
    toString = Object.prototype.toString,
    MAXMAXAGE = 60 * 60 * 24 * 365, // The max maxAge set
    BACKSLASHRE = /\\/g, // Backslash
    DOTFILERE = /^\.|[\\/]\.[^.\\/]/g, // Is dot file or directory
    UPPATHRE = /(?:^|[\\\/])\.\.(?:[\\\/]|$)/, // Parent path
    EventEmitter = require('events').EventEmitter;

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
function httpPath(path){
    BACKSLASHRE.lastIndex = 0;
    return normalize(path).replace(BACKSLASHRE, '/');
}

// Expose send
exports = module.exports = send;

// Expose mime module
exports.mime = mime;

/**
 * Shim EventEmitter.listenerCount for node.js < 0.10
 * @param emitter
 * @param type
 * @returns {Number}
 */
listenerCount = EventEmitter.listenerCount || function (emitter, type){
    var ret;

    // Not EventEmitter
    if (!emitter._events || !emitter._events[type])
        ret = 0;
    else if (isType(emitter._events[type], 'function'))
    // Not function
        ret = 1;
    else
    // Get events type listener
        ret = emitter._events[type].length;

    return ret;
};

/**
 * Return a `SendStream` for `req` and `path`
 * @param {Object} requset
 * @param {String} response
 * @param {Object} options
 * @return {SendStream}
 * @api public
 */
function send(requset, response, options){
    return new SendStream(requset, response, options);
}

/**
 * Initialize a `SendStream` with the given `path`
 * @param {Object} requset
 * @param {String} response
 * @param {Object} options
 * @api private
 */
function SendStream(requset, response, options){
    var path,
        range,  // File range
        maxAge; // Max age

    // Format options
    options = mix({}, options);

    // Reset debug timestamp
    debugTimestamp.reset();

    // Set req property
    this.requset = requset;
    this.response = response;

    // Format path
    path = httpPath(requset.url || '/');
    path = decode(path);

    requset.url = path;
    this.path = path;

    // Bebug infomation
    debugRequest('Path: %s'.green.bold, path);

    // Root
    this.root = isType(options.root, 'string')
        ? resolve(options.root)
        : root;

    this.root = httpPath(this.root + sep);

    // Clean options
    delete options.root;

    // Etag
    this.etag = options.etag !== undefined
        ? Boolean(options.etag)
        : true;

    // Clean options
    delete options.etag;

    // Dot files access, The value can be "allow", "deny", or "ignore"
    this.dotFiles = isType(options.dotFiles, 'string')
        ? options.dotFiles.toLowerCase()
        : 'ignore';

    // Clean options
    delete options.dotFiles;

    // Extensions
    this.extensions = normalizeList(options.extensions);

    // Clean options
    delete options.extensions;

    // Default document
    this.index = isType(options.index, 'array') || isType(options.index, 'string')
        ? normalizeList(options.index)
        : ['index.htm', 'index.html'];

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
        ? (ms(maxAge) || 0) / 1000
        : Number(maxAge);

    this.maxAge = maxAge >= 0
        ? Math.min(Math.max(0, maxAge), MAXMAXAGE)
        : MAXMAXAGE;

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
    var res = this.response,
        msg = http.STATUS_CODES[status];

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
    return this.requset.headers['if-none-match']
        || this.requset.headers['if-modified-since'];
};

/**
 * Strip Content-* header fields
 * @api private
 */
SendStream.prototype.removeContentHeaderFields = function (){
    var res = this.response;

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
    var res = this.response;

    // Debug information
    debugResponse('Not modified');

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
    debugResponse('Headers already sent');

    // 500 error
    this.error(500, err);
};

/**
 * Check if the request is cacheable, aka responded with 2xx or 304 (see RFC 2616 section 14.2{5,6})
 * @return {Boolean}
 * @api private
 */
SendStream.prototype.isCachable = function (){
    var res = this.response;

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
        return this.error(404);
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
    return fresh(this.requset.headers, this.response._headers);
};

/**
 * Check if the range is fresh
 * @return {Boolean}
 * @api private
 */
SendStream.prototype.isRangeFresh = function isRangeFresh(){
    var ifRange = this.requset.headers['if-range'];

    // Not range request
    if (!ifRange) return true;

    return ~ifRange.indexOf('"')
        ? ~ifRange.indexOf(this.response._headers['etag'])
        : Date.parse(this.response._headers['last-modified']) <= Date.parse(ifRange);
};

/**
 * Redirect to path
 * @param {String} path
 * @api private
 */
SendStream.prototype.redirect = function (path){
    var res = this.response;

    // Debug infomation
    debugResponse('Redirect: %s', path);

    // Response
    res.statusCode = 301;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Location', path);
    res.end('Redirecting to <a href="' + escapeHtml(path) + '">' + escapeHtml(path) + '</a>');
};

/**
 * Pipe stream
 * @return {Stream}
 * @api public
 */
SendStream.prototype.pipe = function (){
    var dotFiles,
        req = this.requset,
        res = this.response,
        root = this.root,
        path = this.path; // Decode the path

    // Requset method not support
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        this.error(405);
    }

    // Malicious path
    if (UPPATHRE.test(path)) {
        // Debug infomation
        debugResponse('Malicious path: %s', path);

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
    path = httpPath(join(root, path));

    // Malicious path
    if (httpPath(path + sep).substr(0, root.length) !== root) {
        // Debug infomation
        debugResponse('Malicious path: %s', path);

        // 403
        return this.error(403);
    }

    // Dotfile handling
    if (containsDotFile(path)) {
        dotFiles = this.dotFiles;

        // Debug infomation
        debugResponse('Dot file: %s %s', path, dotFiles);

        // Dot files access
        switch (dotFiles) {
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
        res = this.response,
        req = this.requset,
        ranges = req.headers.range,
        offset = this.range[0],
        rangeEnd = this.range[1];

    if (res.headersSent) {
        // Impossible to send now
        return this.headersAlreadySent();
    }

    // Debug infomation
    debugResponse('Pipe: %s', path);

    // Set header fields
    this.setHeader(path, stat);

    // Set content-type
    this.type(path);

    // Conditional GET support
    if (this.isConditionalGET()
        && this.isCachable()
        && this.isFresh()) {
        // Emit end event
        listenerCount(this, 'end') > 0 && this.emit('end');
        // Not modified
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
            // Debug infomation
            debugResponse('Range stale');
            ranges = -2;
        }

        // Unsatisfiable
        if (-1 == ranges) {
            // Debug infomation
            debugResponse('Range unsatisfiable');
            debugResponse('Content-Range: bytes */%s', stat.size);
            res.setHeader('Content-Range', 'bytes */' + stat.size);

            return this.error(416);
        }

        // Valid (syntactically invalid/multiple ranges are treated as a regular response)
        if (-2 !== ranges && ranges.length === 1) {
            // Debug infomation
            debugResponse('Range: [%s, %s]', ranges[0].start, ranges[0].end);

            // Ranges
            this.range[0] = offset + ranges[0].start;
            this.range[1] = offset + ranges[0].end;

            // Debug infomation
            debugResponse(
                'Content-Range: bytes %s-%s/%s',
                ranges[0].start,
                ranges[0].end,
                len
            );

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

            // Range length
            len = this.range[1] - this.range[0] + 1;
        }
    }

    // Debug infomation
    debugResponse('Content-Length: %s', len);
    // Content-length
    res.setHeader('Content-Length', len);

    // HEAD support
    if (req.method === 'HEAD') {
        // Emit end event
        listenerCount(this, 'end') > 0 && this.emit('end');
        return res.end();
    }

    // Send
    this.stream(path);
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

        // Emit file event
        listenerCount(self, 'file') > 0 && self.emit('file', path, stat);
        self.send(path, stat);
    }

    // Stat
    fs.stat(path, function onstat(err, stat){
        // Debug infomation
        debugResponse('Stat: %s %s', path, err ? err.code : 'OK');

        // Cache stat
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

        // Loop end
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

        // Stat
        fs.stat(_path, function (err, stat){
            // Debug infomation
            debugResponse('Stat: %s %s', _path, err ? err.code : 'OK');

            // Error
            if (err) {
                return next(err);
            }

            // Is directory
            if (stat.isDirectory()) {
                return next();
            }

            // Emit file event
            listenerCount(self, 'file') > 0 && self.emit('file', _path, stat);
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
        // Debug infomation
        debugResponse('Stat: %s %s', path, err ? err.code : 'OK');

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

        // Stat
        fs.stat(_path, function (err, stat){
            // Debug infomation
            debugResponse('Stat: %s %s', _path, err ? err.code : 'OK');

            // Error
            if (err) {
                return next();
            }

            // Is directory
            if (stat.isDirectory()) {
                return next();
            }

            // Emit file event
            listenerCount(self, 'file') > 0 && self.emit('file', _path, stat);
            self.send(_path, stat);
        });
    }
};

/**
 * Stream path to the response
 * @param {String} path
 * @api private
 */
SendStream.prototype.stream = function (path){
    var self = this,
        finished = false,
        res = this.response,
        start = this.range[0],
        end = this.range[1],
        stream = fs.createReadStream(path, {
            start: start,
            end: end
        });

    /**
     * Response
     * @param stream
     */
    function next(stream){
        // Pipe
        stream.pipe(res);
    }

    // Emit stream event
    if (listenerCount(this, 'stream') > 0) {
        this.emit('stream', stream, next, destroy);
    } else {
        // Response
        next(stream);
    }

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
        // Emit end event
        listenerCount(self, 'end') > 0 && self.emit('end');
    });
};

/**
 * Set content-type based on `path` if it hasn't been explicitly set
 * @param {String} path
 * @api private
 */

SendStream.prototype.type = function (path){
    var type, charset,
        res = this.response;

    // Already set Content-Type
    if (res.getHeader('Content-Type')) return;

    // Get MIME
    type = mime.lookup(path);
    charset = mime.charsets.lookup(type);

    // Debug infomation
    debugResponse('Content-Type %s', type);

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
        date, cache,
        res = this.response;

    // Emit headers event
    listenerCount(this, 'headers') > 0 && this.emit('headers', res, path, stat);

    // Set Accept-Ranges
    if (!res.getHeader('Accept-Ranges')) {
        // Debug infomation
        debugResponse('Accept-Ranges: bytes');
        res.setHeader('Accept-Ranges', 'bytes');
    }

    // Set Date
    if (!res.getHeader('Date')) {
        date = new Date().toUTCString();

        // Debug infomation
        debugResponse('Date: %s', date);
        res.setHeader('Date', date);
    }

    // Set Cache-Control
    if (!res.getHeader('Cache-Control')) {
        cache = Math.floor(this.maxAge / 1000);

        // Debug infomation
        debugResponse('Cache-Control: public, max-age=%s', cache);
        res.setHeader(
            'Cache-Control',
            'public, max-age=' + cache
        );
    }

    // Set Last-Modified
    if (this.lastModified && !res.getHeader('Last-Modified')) {
        modified = stat.mtime.toUTCString();

        // Debug infomation
        debugResponse('Last-Modified: %s', modified);
        res.setHeader('Last-Modified', modified);
    }

    // Set ETag
    if (this.etag && !res.getHeader('ETag')) {
        val = etag(stat, {
            weak: false // Disable weak etag
        });

        // Debug infomation
        debugResponse('ETag: %s', val);
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
