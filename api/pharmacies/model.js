var	r = require('../../utils/rethinkdb.js')(),
	bcrypt = require('co-bcryptjs'),
	_ = require('lodash'),
	MODEL = require('../Model.js');

/*
	//base
	"created_at": 'Sun Feb 05 2017 15:26:12 GMT+00:00',
	"updated_at": 'Sun Feb 05 2017 15:26:12 GMT+00:00',
	"id":  "a7eca81e-2e11-42bc-81ee-496461dfaada" ,
	
	//ref
	"user":  "8bcd8ee9-284f-4894-bb5f-5072cb08d3ea",
	"PayPal":  "idDoPayPal" ,
	
	//data
	"shotName":  "Farmais" ,
	"CNPJ": 1101000101001 ,
	"brand":  "urlimage.png" ,
	"legalName":  "Farmais ltda"
*/

var dataToModel = {
	schema: ['legalName','brand','CNPJ','shortName','PayPal','user','created_at','updated_at'],
	table: 'pharmacies'
};
	
var Model = new MODEL(dataToModel);

//Model.getAll = function*(){
//	result = yield r.db('betest')
//						.table(dataToModel.table)
//						.eqJoin("user", 
//								r.db('betest').table("users")
//							   ).zip()
//}

Model.getByEmail = function*(email){
	var result, criteria, user;
		criteria = {};
		
		//trata o email que é recebido
		criteria.email = email.toLowerCase();
	
		//busca agora a Model
		result = yield r.db('betest')
						.table(dataToModel.table)
						.eqJoin("user", 
								r.db('betest').table("users")
							   ).zip()
						.filter(criteria)
	
	return result;
}

//Model.getById = function*(id){
//	var result, criteria, user;
//		criteria = {};
//		
//		//trata o email que é recebido
//		criteria. = id;
//	
//		//busca agora a Model
//		result = yield r.db('betest')
//						.table(dataToModel.table)
//						.eqJoin("user", 
//								r.db('betest').table("users")
//							   ).zip()
//						.filter(criteria)
//	
//	return result;
//}


module.exports = Model;