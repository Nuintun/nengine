/**
 * nengine
 * https://nuintun.github.io/nengine
 *
 * Licensed under the MIT license
 * https://github.com/Nuintun/nengine/blob/master/LICENSE
 */

'use strict';

// external lib
var path = require('path'); // nodejs libs
var nopt = require('nopt'); // external libs

// variable declaration
var parsed;
var known = {};
var aliases = {};
var optlist = cli.optlist = {
  root: {
    short: 'r',
    info: 'Set server root directory',
    type: path
  },
  port: {
    short: 'p',
    info: 'Set server port',
    type: Number
  },
  configfile: {
    short: 'c',
    info: 'Set nengine config file path',
    type: path
  },
  help: {
    short: 'h',
    info: 'Display nengine help text',
    type: Boolean
  },
  version: {
    short: 'V',
    info: 'Print nengine version',
    type: Boolean
  },
  verbose: {
    short: 'v',
    info: 'Verbose mode, a lot more information output',
    type: Boolean
  }
};

// default command
cli.cmdlist = {
  run: {
    info: 'Run nengine server'
  }
};

// initialize nopt params
Object.keys(optlist).forEach(function (key){
  var short = optlist[key].short;

  if (short) {
    aliases[short] = '--' + key;
  }

  known[key] = optlist[key].type;
});

// get command line params
parsed = nopt(known, aliases, process.argv, 2);

// set cli cmd and options
cli.cmd = parsed.argv.remain;
cli.options = parsed;

// clean cli.options
delete parsed.argv;

/**
 * this is only executed when run via command line
 */
function cli(){
  // run command
  return require('../index').exec(cli.cmd, cli.options);
}

// exports cli
module.exports = cli;
