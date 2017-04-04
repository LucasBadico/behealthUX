var	r = require('../../utils/rethinkdb.js')(),
	bcrypt = require('co-bcryptjs'),
	_ = require('lodash'),
	MODEL = require('../Model.js');

var dataToModel = {
	schema: ['created_at','updated_at',"cart","receipes","user","status","type","paypal"],
	table: 'orders'
}
var Model = new MODEL(dataToModel);

//Model.addKey = function*(array) {
//	var result;
//		result = yield r.table(dataToModel.table)
//		.filter(r.row('keys')
//			.contains(function(item){
//					return item.match("^" + string)
//				}
//			));
//	return result;
//}

Model.getPaying = function*(user){
	var result,
		criteria = {
			user:user,
			status:'paying'
		};
	
		result = yield r.table(dataToModel.table)
					.filter(criteria)
					.run();
	
	console.log('result in order/Cart model',JSON.stringify(result));
	return result;
}

Model.getCart = function*(user){
	var result,
		criteria = {
			user:user,
			type:'cart'
		};
	
		result = yield r.table(dataToModel.table)
					.filter(criteria)
					.run();
	
	console.log('result in order/Cart model',JSON.stringify(result));
	return result;
}

module.exports = Model;