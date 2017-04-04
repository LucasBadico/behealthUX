var	r = require('../../utils/rethinkdb.js')(),
	bcrypt = require('co-bcryptjs'),
	_ = require('lodash'),
	MODEL = require('../Model.js');

var dataToModel = {
	schema: ['created_at','updated_at',"file","type","user",'path','filename','category'],
	table: 'files'
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

module.exports = Model;