/**
 * nengine
 * https://nuintun.github.io/nengine
 *
 * Licensed under the MIT license
 * https://github.com/Nuintun/nengine/blob/master/LICENSE
 */

'use strict';

var parsed, // nopt parsed result
    cmdlist, // Default command
    optlist, // Default options
    known = {}, // Parse `optlist` into a form that nopt can handle
    aliases = {}, // Parse `optlist` into a form that nopt can handle
    path = require('path'), // Nodejs libs
    nopt = require('nopt'); // External libs

// Default command
cmdlist = cli.cmdlist = {
    run: {
        info: 'Run nengine server'
    }
};

// Default options
optlist = cli.optlist = {
    root: {
        short: 'r',
        info: 'Set the site root directory',
        type: path
    },
    port: {
        short: 'p',
        info: 'Set the site port',
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

// Initialize nopt params
Object.keys(optlist).forEach(function (key){
    var short = optlist[key].short;

    if (short) {
        aliases[short] = '--' + key;
    }

    known[key] = optlist[key].type;
});

// Get command line params
parsed = nopt(known, aliases, process.argv, 2);

// Set cli cmd and options
cli.cmd = parsed.argv.remain;
cli.options = parsed;

// Clean cli.options
delete parsed.argv;

/**
 * This is only executed when run via command line
 */
function cli(){
    // Run command
    return require('./nengine').exec(cli.cmd, cli.options);
}

// exports cli
module.exports = cli;