/**
 * nengine
 * https://nuintun.github.io/nengine
 *
 * Licensed under the MIT license.
 * https://github.com/Nuintun/nengine/blob/master/LICENSE
 */

'use strict';

var col1len = 0, // Set column widths.
    path = require('path'), // Nodejs libs.
    nengine = require('./nengine');

exports.initCol1 = function (str){
    col1len = Math.max(col1len, str.length);
};

exports.initWidths = function (){
    // Widths for options/tasks table output.
    exports.widths = [1, col1len, 2, 76 - col1len];
};

// Render an array in table form.
exports.table = function (arr){
    arr.forEach(function (item){
        nengine.log.writetableln(exports.widths, ['', nengine.util._.pad(item[0], col1len), '', item[1]]);
    });
};

// Methods to run, in-order.
exports.queue = [
    'initOptions',
    'initWidths',
    'header',
    'usage',
    'options',
    'optionsFooter',
    'footer'
];

// Actually display stuff.
exports.display = function (){
    exports.queue.forEach(function (name){ exports[name](); });
};

// Header.
exports.header = function (){
    nengine.log.writeln('nengine: The JavaScript Task Runner (v' + nengine.version + ')');
};

// Usage info.
exports.usage = function (){
    nengine.log.header('Usage');
    nengine.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
};

// Options.
exports.initOptions = function (){
    // Build 2-column array for table view.
    exports._options = Object.keys(nengine.cli.optlist).map(function (long){
        var o = nengine.cli.optlist[long];
        var col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
        exports.initCol1(col1);
        return [col1, o.info];
    });
};

exports.options = function (){
    nengine.log.header('Options');
    exports.table(exports._options);
};

exports.optionsFooter = function (){
    nengine.log.writeln().writelns(
        'Options marked with * have methods exposed via the nengine API and should ' +
        'instead be specified inside the nenginefile wherever possible.'
    );
};

// Footer.
exports.footer = function (){
    nengine.log.writeln().writeln('For more information, see https://nuintun.github.io/nengine');
};
