$_mod.def("/marko$3.14.2/runtime/stream/index-browser", function(require, exports, module, __filename, __dirname) { var stream;
var STREAM = 'stream';

var streamPath;
try {
    streamPath = require.resolve(STREAM);
} catch(e) {}

if (streamPath) {
    stream = require(streamPath);
}

module.exports = stream;
});