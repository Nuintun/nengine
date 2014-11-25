/*!
 * serve-static
 * Copyright(c) 2010 Sencha Inc
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2014 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies
 */
var url = require('url'),
    send = require('send'),
    merge = require('./merge'),
    parseurl = require('parseurl'),
    resolve = require('path').resolve,
    escapeHtml = require('escape-html');

/**
 * @param {String} root
 * @param {Object} options
 * @return {Function}
 * @api public
 */
module.exports = function serveStatic(root, options){
    var redirect, setHeaders;

    if (!root) {
        throw new TypeError('root path required');
    }

    if (typeof root !== 'string') {
        throw new TypeError('root path must be a string');
    }

    // copy options object
    options = merge({}, options);

    // resolve root to absolute
    root = resolve(root);

    // default redirect
    redirect = options.redirect !== false;
    // headers listener
    setHeaders = options.setHeaders;

    delete options.setHeaders;

    if (setHeaders && typeof setHeaders !== 'function') {
        throw new TypeError('option setHeaders must be function')
    }

    // setup options for send
    options.maxage = options.maxage || options.maxAge || 0;
    options.root = root;

    return function serveStatic(req, res, next){
        var opts, path, stream, target,
            originalUrl, hasTrailingSlash;

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return next();
        }

        opts = merge({}, options);
        originalUrl = parseurl.original(req);
        path = parseurl(req).pathname;
        hasTrailingSlash = originalUrl.pathname[originalUrl.pathname.length - 1] === '/';

        if (path === '/' && !hasTrailingSlash) {
            // make sure redirect occurs at mount
            path = '';
        }

        // create send stream
        stream = send(req, path, opts);

        if (redirect) {
            if (hasTrailingSlash) {
                return next();
            }

            // redirect relative to originalUrl
            stream.on('directory', function (){
                originalUrl.pathname += '/';
                target = url.format(originalUrl);

                res.statusCode = 303;
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Location', target);
                res.end('Redirecting to <a href="' + escapeHtml(target) + '">' + escapeHtml(target) + '</a>');
            });
        } else {
            // forward to next middleware on directory
            stream.on('directory', function (){
                next('directory');
            });
        }

        // add headers listener
        if (setHeaders) {
            stream.on('headers', setHeaders)
        }

        // forward non-404 errors
        stream.on('error', next);

        // pipe
        stream.pipe(res);

        return stream;
    }
};

/**
 * Expose mime module.
 *
 * If you wish to extend the mime table use this
 * reference to the "mime" module in the npm registry.
 */
module.exports.mime = send.mime;
