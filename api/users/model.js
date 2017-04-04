var	r = require('../../utils/rethinkdb.js')(),
	bcrypt = require('co-bcryptjs'),
	_ = require('lodash'),
	MODEL = require('../Model.js');

var dataToModel = {
	schema: ['email','password','role','firstName', 'fullName','CPF','cel','created_at','updated_at'],
	table: 'users'
}
var Model = new MODEL(dataToModel);

Model.getByEmail = function*(email){
	var result, criteria;
	
		criteria = {};
		criteria.email = email.toLowerCase();
		result =  yield r.table(dataToModel.table)
			.filter(criteria)
			.run();
	return result
}

module.exports = Model;