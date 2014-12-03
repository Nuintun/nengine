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
    send = require('./send'),
    mix = require('./mix'),
    parseurl = require('parseurl'),
    resolve = require('path').resolve,
    escapeHtml = require('escape-html');

/**
 * Exports
 * @param {String} root
 * @param {Object} options
 * @return {Function}
 * @api public
 */
module.exports = function serveStatic(root, options){
    var redirect, setHeaders;

    if (!root) {
        throw new TypeError('Root path required');
    }

    if (typeof root !== 'string') {
        throw new TypeError('Root path must be a string');
    }

    // Copy options object
    options = mix({}, options);

    // Resolve root to absolute
    root = resolve(root);

    // Default redirect
    redirect = options.redirect !== false;
    // Headers listener
    setHeaders = options.setHeaders;

    delete options.setHeaders;

    if (setHeaders && typeof setHeaders !== 'function') {
        throw new TypeError('Option setHeaders must be function')
    }

    // Setup options for send
    options.maxage = options.maxage || options.maxAge || 0;
    options.root = root;

    return function serveStatic(req, res, next){
        var opts, path, stream;
        //, target,
        //originalUrl, hasTrailingSlash;

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return next({
                stauts: 405,
                message: 'Method Not Allowed'
            });
        }

        opts = mix({}, options);
        //originalUrl = parseurl.original(req);
        path = parseurl(req).pathname;
        //hasTrailingSlash = originalUrl.pathname[originalUrl.pathname.length - 1] === '/';
        //
        //if (path === '/' && !hasTrailingSlash) {
        //    // Make sure redirect occurs at mount
        //    path = '';
        //}

        // Create send stream
        stream = send(req, path, opts);

        //if (redirect) {
        //    if (hasTrailingSlash) {
        //        return next({
        //            status: 403,
        //            message: 'Forbidden'
        //        });
        //    }
        //
        //    // Redirect relative to originalUrl
        //    stream.on('directory', function (){
        //        originalUrl.pathname += '/';
        //        target = url.format(originalUrl);
        //
        //        res.statusCode = 303;
        //        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        //        res.setHeader('Location', target);
        //        res.end('Redirecting to <a href="' + escapeHtml(target) + '">' + escapeHtml(target) + '</a>');
        //    });
        //} else {
        //    // Forward to next middleware on directory
        //    stream.on('directory', function (){
        //        next('directory');
        //    });
        //}
        //
        //// Add headers listener
        //if (setHeaders) {
        //    stream.on('headers', setHeaders)
        //}

        // Forward non-404 errors
        stream.on('error', next);

        stream.on('directory', function (path, stat){
            console.log(JSON.stringify(stat, null, 2));
            this.res.end();
        });

        // Send data
        stream.pipe(res);

        // Return stream
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
