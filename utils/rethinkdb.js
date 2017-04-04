var dash = require('rethinkdbdash'),
	config = require('../config/config.js');

var r;

module.exports = function(options) {
	if(!r){
		options = options || config.rethink;
		r = dash(options);
	}
	return r;
}