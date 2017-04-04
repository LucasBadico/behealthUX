$_mod.def("/raptor-logging$1.1.2/lib/index", function(require, exports, module, __filename, __dirname) { var g = typeof window === 'undefined' ? global : window;
// Make this module a true singleton
module.exports = g.__RAPTOR_LOGGING || (g.__RAPTOR_LOGGING = require('/raptor-logging$1.1.2/lib/raptor-logging'/*'./raptor-logging'*/));
});