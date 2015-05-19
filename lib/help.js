/**
 * nengine
 * https://nuintun.github.io/nengine
 *
 * Licensed under the MIT license
 * https://github.com/Nuintun/nengine/blob/master/LICENSE
 */

'use strict';

// External lib
var path = require('path');
var nengine = require('./nengine');
var colors = require('colors/safe');

// Variable declaration
var colwidth = 0; // Set column widths
var title = process.title;

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
      colors.yellow.bold(pad(item[0], colwidth + 5)),
      colors.white.bold(item[1])
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
    colors.cyan.bold(title + ': ')
    + colors.bold(nengine.description + ' (')
    + colors.green.bold('v' + nengine.version)
    + colors.bold(')')
  );
};

// Usage info
exports.usage = function (){
  exports.blankLine();
  console.log(
    colors.magenta.bold('Usage: ')
    + colors.green.bold(title)
    + colors.yellow.bold(' [options] [command]')
  );
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
  console.log(colors.magenta.bold('Command:'));
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

// blank line
exports.blankLine = function (){
  console.log('');
};

exports.options = function (){
  exports.blankLine();
  console.log(colors.magenta.bold('Options:'));
  exports.table(exports._options);
};

// Footer
exports.footer = function (){
  exports.blankLine();
  console.log(
    colors.white.bold('For more information, see: ')
    + colors.magenta.bold('https://nuintun.github.io/nengine')
  );
};

// Display nengine-cli version
exports.version = function (verbose){
  console.log(
    colors.cyan.bold('nengine ')
    + colors.green.bold('v' + nengine.version)
    + (verbose ? ' installed in: ' + colors.magenta.bold(path.dirname(__dirname)) : '')
  );
  process.exit();
};
