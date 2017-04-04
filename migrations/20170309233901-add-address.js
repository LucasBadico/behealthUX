var TABLE = 'address';

exports.up = function (r, connection) {
	r.tableCreate(TABLE)
		.run(connection);
};

exports.down = function (r, connection) {
  	r.tableDrop(TABLE)
		.run(connection);
};