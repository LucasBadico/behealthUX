var	r = require('../../utils/rethinkdb.js')(),
	bcrypt = require('co-bcryptjs'),
	_ = require('lodash'),
	MODEL = require('../Model.js');

var dataToModel = {
	schema: ['created_at','updated_at',"keys","unid","childs"],
	table: 'substances'
}
var Model = new MODEL(dataToModel);

Model.getByKey = function*(key){
	
	var result;
		result =  yield r.table(dataToModel.table)		
			.filter(r.row('keys').contains(key))
			.run();
	if(key == "dha"){
		console.log('DHA', result);
	}
	if(result){
		return result[0]
	}else{
		return false;
	}
//	return result[0]
}

Model.search = function*(string) {
	var result;
		result = yield r.table(dataToModel.table)
		.filter(r.row('keys')
			.contains(function(item){
					return item.match("^" + string)
				})
			)
			.run();
	return result;
}

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

module.exports = Model;