var	r = require('../utils/rethinkdb.js')(),
	_ = require('lodash');

var TABLE;

var Model = function (data){
	this.table = data.table;
	this.schema = data.schema;
}

Model.prototype.SCHEMA  = function() {
	return this.schema;
}

Model.prototype.getAll = function*(){
	var all = yield r.table(this.table)
		.run();
	return all;
}

Model.prototype.getById = function*(id){
	var result, criteria;
		criteria = id;
		result =  yield r.table(this.table)
			.get(criteria)
			.run();
	return result
}

Model.prototype.update = function*(id,data){
	var result;
	
	data.updated_at = r.now();
	
	result = yield r.table(this.table)
			.get(id)
			.update(data)
			.run();
	
	return result;
}

Model.prototype.save = function*(data){
	var result;
	data.created_at = r.now();
	data.updated_at = r.now();
		
		result = yield r.table(this.table)
			.insert(data)
			.run()
	return result;
}

module.exports = Model;