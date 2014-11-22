/**
 * Created by Newton on 2014/11/22.
 */
var path = require('path'),
    template = require('./template');

function parse(root, filepath, data){
    var relapath = path.relative(root, __dirname);

    data = data || {};
    filepath = path.join(root, relapath, filepath);

    data.NativeAssetsRoot = relapath.replace(/\\/g, '/');

    return template(filepath, data);
}

module.exports = parse;