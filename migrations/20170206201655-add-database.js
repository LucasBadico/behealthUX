var config = require('../config/config.js');

exports.up = function (r, connection) {
	r.dbCreate(config.rethink.db)
		.run(connection);
};

exports.down = function (r, connection) {
  r.dbDrop(config.rethink.db)
		.run(connection);
};

//add the secondary indexes