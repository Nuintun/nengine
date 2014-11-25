/**
 * nengine
 * https://nuintun.github.io/nengine
 *
 * Licensed under the MIT license
 * https://github.com/Nuintun/nengine/blob/master/LICENSE
 */

'use strict';

var base = __dirname,
    path = require('path'),
    merge = require('../lib/merge'),
    template = require('./template');

template.config('base', base);
template.config('compress', true);

function parse(root, filepath, data){
    var relapath = '/' + path.relative(root, base).replace(/\\/g, '/');

    data = merge({}, data);

    data.NengineAssetsRoot = relapath;

    return template(filepath, data);
}

module.exports = function (root){
    return {
        html: {
            404: parse(root, '/html/404'),
            folder: function (dirpath, files){
                return parse(root, '/html/folder', {
                    files: files,
                    dirpath: dirpath
                });
            },
            'default': function (status, message){
                return parse(root, '/html/default', {
                    status: status,
                    message: message
                });
            }
        },
        parse: parse
    };
};