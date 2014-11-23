/**
 * Created by Newton on 2014/11/22.
 */
var base = __dirname,
    path = require('path'),
    merge = require('../lib/merge'),
    template = require('./template');

template.config('base', base);
template.config('cache', false);

function parse(root, filepath, data){
    var relapath = path.relative(root, base);

    data = merge({}, data);

    data.NengineAssetsRoot = relapath.replace(/\\/g, '/');

    return template(filepath, data);
}

module.exports = function (root){
    return {
        html: {
            404: parse(root, '/html/404'),
            folder: function (files){
                return parse(root, '/html/folder', files);
            },
            'default': parse(root, '/html/default')
        },
        parse: parse
    };
};