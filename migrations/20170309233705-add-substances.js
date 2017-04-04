var TABLE = 'substances';

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
		"id":  "7de537c0-b788-4561-9d1d-ddf874d1b0d0",
		"created_at": 122123213,
		"updated_at":1233123,

		"keys":["omega 3","omega3","omega três"],
		"unid":"g",

		"childs:":{
			"connector": "sendo",
			"substances":["idDoDHP","idDoPCP"]
		}
	}

	{
		"id":  "idDoDHP",
		"created_at": 122123213,
		"updated_at":1233123,

		"keys":["DHP"],
		"und":"%"
	}

	{
		"id":  "idDoDHP",
		"created_at": 122123213,
		"updated_at":1233123,

		"keys":["DHP"],
		"und":"%"
	}

Key para buscar esse omega 3

	{
		"idDoOmega3":"quantidadeDoOmega3",
		"idDoDHP":"quantidadeDoDHP"	
	}


===================
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
		"unidade":
	}


=====================
Prices

	{
		"created_at": 122123213,
		"updated_at":1233123,
		"id": "7de537c0-b788-4561-9d1d-ddf874d1b0d0",
		"price":20.50,
		"seller":"idDoVendedor"
		"product":"idDoProduto"
	}

=====================

*/
