var	r = require('../../utils/rethinkdb.js')(),
	_ = require('lodash'),
	Model = require('./model.js');

var Medicine = function(properties,force){
	this.init(force);
	_.assign(this, properties);
}

Medicine.findAllMedicines = function*(rest){
	var result, array;
	
	array = yield Model.getAll();
	
	if(rest){
		result = array;
		
	}else{
		result = [];
		
		array.forEach(function(item, index){
			let med = new Medicine(item,true);
			result.push(med)
		})
	}
	
	return result;
}

Medicine.findById = function*(id){
	var result;
	result = yield Model.getById(id);
	if(result){
		med = new Medicine(result,true)
	}
	
	return med;
}

Medicine.findBySubstances = function*(substances){
	var result;
//	console.log('in controller', substances);
	result = yield Model.getByFilter(substances);
	///console.lo
	
	if(result.length){
//		console.log(result.length);
		med = new Medicine(result[0],true);
	}else{
		med = false;
	}
	
	return med;
}

Medicine.instantSearch = function*(string) {
	var result;
	result = yield Model.search(string);
	return result;
}


Medicine.prototype.save = function*(){
	var result,data;
	
	
	data = _.pick(this,Model.SCHEMA());

	
	if(this.id){
		result = yield Model.update(this.id,data);	
	}
	else{
		result = yield Model.save(data);

		if(result && result.inserted === 1){
			this.id = result.generated_keys[0];
		}
	
	}
}

Medicine.prototype.init = function(force) {

}

module.exports = Medicine;

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
			  "composition":"in string formate? yes because do not have to rewrite all the time",
			  "categorys":["whereToUse"],
			  "dosage":"instrução de como usar",
			  "description":[]
		  }

*****************************************************/