var	r = require('../../utils/rethinkdb.js')(),
	_ = require('lodash'),
	MODEL = require('../Model.js');

var dataToModel = {
	schema: ['price','unidade','substances','composition','name','label','categorys','dosage','description','created_at','updated_at'],
	table: 'medicines'
}
var Model = new MODEL(dataToModel);

Model.getByFilter = function*(filter){
	var result;
//	console.log(filter);
		result =  yield r.table(dataToModel.table)
			.filter(filter)
			.run();
	
//	console.log('result',result)
	return result
}

Model.search = function*(string) {
	var result;
		result = yield r.table(dataToModel.table)
		  .filter(function(doc){
				return doc('label').match("^" + string)
			})
			.run();
	return result;
}

module.exports = Model;