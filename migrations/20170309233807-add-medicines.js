var TABLE = 'medicines';

exports.up = function (r, connection) {
	r.tableCreate(TABLE)
		.run(connection);
};

exports.down = function (r, connection) {
  	r.tableDrop(TABLE)
		.run(connection);
};

/***************************************************
	Medicines
	{
		"created_at": 122123213,
		"id":  "7de537c0-b788-4561-9d1d-ddf874d1b0d0" ,
		"updated_at":1233123,
		"substances":{
		  "idDaSubstancia1":"qtd",
		  "idDaSubstancia2":"qtd"
		  },
		"posologia":"instrução de como usar",
		"composition":"in string formate? yes because do not have to rewrite all the time",
		"categorys":["whereToUse"],
		""
	}

*****************************************************/