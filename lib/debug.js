/**
 * nengine
 * https://nuintun.github.io/nengine
 *
 * Licensed under the MIT license
 * https://github.com/Nuintun/nengine/blob/master/LICENSE
 */

var ms = require('ms'),  // External libs
    nopt = require('nopt'),
    verbose = nopt(
        { verbose: Boolean },
        { v: '--verbose' },
        process.argv, 2
    ).verbose,
    FORMATRE = /%s/g,
    slice = Array.prototype.slice;

// Colors
require('colors');

function format(){
    var i = 0,
        str = arguments[0] || '',
        args = slice.call(arguments, 1);

    FORMATRE.lastIndex = 0;

    return str.replace(FORMATRE, function (math){
        return args[i++] || math;
    });
}

/**
 * Debug
 * @param namespace
 * @returns {fn}
 */
function debug(namespace){
    var self = {
        verbose: verbose || false
    };

    // Reset timestamp
    fn.reset = function (){
        if (self.verbose) {
            var curr = +new Date(); // Set `diff` timestamp

            self.diff = curr - (self.prev || curr);
            self.prev = curr;
        }
    };

    /**
     * Debug fn
     */
    function fn(){
        fn.reset();

        self.verbose && console.log(
            '[DEBUG] '.blue.bold
            + (namespace + ' - ').cyan.bold
            + format.apply(this, arguments)
            + (' +' + ms(self.diff)).cyan.bold
        );
    }

    return fn;
}

// Exports
module.exports = debug;