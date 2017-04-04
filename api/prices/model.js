var	r = require('../../utils/rethinkdb.js')(),
	bcrypt = require('co-bcryptjs'),
	_ = require('lodash'),
	MODEL = require('../Model.js');

var dataToModel = {
	schema: ['price','product','seller','created_at','updated_at'],
	table: 'prices'
}
var Model = new MODEL(dataToModel);

Model.getPriceByProductAndSeller = function*(product,seller){
	var result, criteria;
	
		criteria = data;
		criteria.product = product;
		criteria.seller = seller;
		result =  yield r.table(dataToModel.table)
			.filter(criteria)
			.run();
	return result
}

Model.getPricesByProduct = function*(product){
	var result, criteria;
	
		criteria = data;
		criteria.product = product;
		result =  yield r.table(dataToModel.table)
			.filter(criteria)
			.run();
	return result
}

Model.getPricesBySeller = function*(seller){
	var result, criteria;
	
		criteria = data;
		criteria.seller = seller;
		result =  yield r.table(dataToModel.table)
			.filter(criteria)
			.run();
	return result
}
module.exports = Model;