/**
 * Created by Newton on 2014/11/22.
 */
var base = __dirname,
    path = require('path'),
    template = require('./template');

template.config('base', base);

function parse(root, filepath, data){
    var relapath = path.relative(root, base);

    data = data || {};

    data.NativeAssetsRoot = relapath.replace(/\\/g, '/');

    return template(filepath, data);
}

module.exports = function (root){
    return {
        status: {
            404: parse(root, '/html/404')
        },
        parse: parse
    };
};