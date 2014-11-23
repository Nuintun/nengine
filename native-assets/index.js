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

    data.NativeAssetsRoot = relapath.replace(/\\/g, '/');

    var fn = template(filepath, data);

    console.log(template.get(filepath).toString().replace(/\\n/g, ''));

    return fn;
}

module.exports = function (root){
    return {
        html: {
            404: parse(root, '/html/404'),
            files: function (files){
                return parse(root, '/html/files', files);
            },
            default: parse(root, '/html/default')
        },
        parse: parse
    };
};