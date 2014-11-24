/**
 * nengine
 * https://nuintun.github.io/nengine
 *
 * Licensed under the MIT license.
 * http://github.com/Nuintun/nengine/LICENSE-MIT
 */

'use strict';

var optlist, // Default options.
    aliases = {}, // Parse `optlist` into a form that nopt can handle.
    known = {}, // Parse `optlist` into a form that nopt can handle.
    parsed, // nopt parsed result
    nengine = require('./nengine'),
    path = require('path'), // Nodejs libs.
    nopt = require('nopt'); // External libs.

// Default options.
optlist = cli.optlist = {
    help: {
        short: 'h',
        info: 'Display this help text.',
        type: Boolean
    },
    root: {
        info: 'Specify an alternate root path. By default, all file paths are relative to the configfile.',
        type: path
    },
    configfile: {
        info: 'Specify an alternate configfile. By default, nengine looks in the current or parent directories for the nearest nengine.js.',
        type: path
    },
    debug: {
        short: 'd',
        info: 'Enable debugging mode for tasks that support it.',
        type: [Number, Boolean]
    },
    stack: {
        info: 'Print a stack trace when exiting with a warning or fatal error.',
        type: Boolean
    },
    verbose: {
        short: 'v',
        info: 'Verbose mode. A lot more information output.',
        type: Boolean
    },
    version: {
        short: 'V',
        info: 'Print the grunt version. Combine with --verbose for more info.',
        type: Boolean
    }
};

Object.keys(optlist).forEach(function (key){
    var short = optlist[key].short;

    if (short) {
        aliases[short] = '--' + key;
    }

    known[key] = optlist[key].type;
});

parsed = nopt(known, aliases, process.argv, 2);

cli.cmd = parsed.argv.remain;
cli.options = parsed;

delete parsed.argv;

// Initialize any Array options that weren't initialized.
Object.keys(optlist).forEach(function (key){
    if (optlist[key].type === Array && !(key in cli.options)) {
        cli.options[key] = [];
    }
});

// This is only executed when run via command line.
function cli(options){
    // CLI-parsed options override any passed-in "default" options.
    if (options) {
        // For each default option...
        Object.keys(options).forEach(function (key){
            if (!(key in cli.options)) {
                // If this option doesn't exist in the parsed cli.options, add it in.
                cli.options[key] = options[key];
            } else if (cli.optlist[key].type === Array) {
                // If this option's type is Array, append it to any existing array
                // (or create a new array).
                [].push.apply(cli.options[key], options[key]);
            }
        });
    }

    // Run tasks.
    nengine.tasks(cli.cmd, cli.options);
}

// exports cli
module.exports = cli;