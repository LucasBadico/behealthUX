var TABLE = 'prices';

exports.up = function (r, connection) {
	r.tableCreate(TABLE)
		.run(connection);
};

exports.down = function (r, connection) {
  	r.tableDrop(TABLE)
		.run(connection);
};

/*
{
	"created_at": 122123213,
	"updated_at":1233123,
	"id":  "7de537c0-b788-4561-9d1d-ddf874d1b0d0" ,

	"price":20.50,
	"seller":"idDoVendedor"
	"product":"idDoProduto"
}
*/