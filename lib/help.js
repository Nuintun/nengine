/**
 * nengine
 * https://nuintun.github.io/nengine
 *
 * Licensed under the MIT license
 * https://github.com/Nuintun/nengine/blob/master/LICENSE
 */

'use strict';

var colwidth = 0, // Set column widths
  title = process.title,
  path = require('path'),
  nengine = require('./nengine');

// Colors
require('colors');

// Methods to run, in-order
exports.queue = [
  'initCommand',
  'initOptions',
  'header',
  'usage',
  'command',
  'options',
  'footer'
];

exports.firstColWidth = function (str){
  colwidth = Math.max(colwidth, str.length);
};

// Format string to custom length
function pad(str, len, holder){
  holder = typeof holder === 'string' ? holder : ' ';

  var blink = new Array(len).join(holder);

  return str + blink.slice(str.length);
}

// Render an array in table form
exports.table = function (arr){
  arr.forEach(function (item){
    console.log(
      pad(item[0], colwidth + 5).yellow.bold,
      item[1].white.bold
    );
  });
};

// Display help info
exports.help = function (){
  exports.queue.forEach(function (name){
    exports[name]();
  });
};

// Header
exports.header = function (){
  console.log(
    (title + ': ').cyan.bold +
    (nengine.description + ' (').bold +
    ('v' + nengine.version).green.bold + ')'.bold
  );
};

// Usage info
exports.usage = function (){
  exports.blankLine();
  console.log('Usage: '.magenta.bold + title.green.bold + ' [options] [command]'.yellow.bold);
};

exports.initCommand = function (){
  var cmdlist = nengine.cli.cmdlist;

  // Build 2-column array for table view
  exports._command = Object.keys(cmdlist).map(function (cmd){
    var cmdinfo = cmdlist[cmd];

    cmd = '  ' + cmd;
    exports.firstColWidth(cmd);

    return [cmd, cmdinfo.info];
  });
};

exports.command = function (){
  exports.blankLine();
  console.log('Command:'.magenta.bold);
  exports.table(exports._command);
};

// Options.
exports.initOptions = function (){
  var optlist = nengine.cli.optlist;

  // Build 2-column array for table view
  exports._options = Object.keys(optlist).map(function (option){
    var optinfo = optlist[option],
      negate = optinfo.negate ? 'no-' : '',
      short = optinfo.short ? ', -' + optinfo.short : '',
      tags = '  --' + negate + option + short;

    exports.firstColWidth(tags);

    return [tags, optinfo.info];
  });
};

//
exports.blankLine = function (){
  console.log('');
};

exports.options = function (){
  exports.blankLine();
  console.log('Options:'.magenta.bold);
  exports.table(exports._options);
};

// Footer
exports.footer = function (){
  exports.blankLine();
  console.log('For more information, see: '.white.bold + 'https://nuintun.github.io/nengine'.magenta.bold);
};

// Display nengine-cli version
exports.version = function (verbose){
  console.log(
    'nengine '.cyan.bold +
    ('v' + nengine.version).green.bold +
    (verbose ? ' installed in: ' +
    path.dirname(__dirname).magenta.bold : '')
  );
  process.exit();
};
