var	r = require('../../utils/rethinkdb.js')(),
	bcrypt = require('co-bcryptjs'),
	_ = require('lodash'),
	Model = require('./model.js');

var Substance = function(properties,force){
	this.init(force);
	_.assign(this, properties);
}

Substance.findAllSubstances = function*(rest){
	var result, array;
	
	array = yield Model.getAll();
	
	if(rest){
		result = array;
		
	}else{
		result = [];
		
		array.forEach(function(item, index){
			let substance = new Substance(item,true);
			result.push(substance);
		})
	}
	
	return result;
}

Substance.findById = function*(id){
	var result,substance;
	result = yield Model.getById(id);
	if(result){
		substance = new Substance(result,true)
	}
	
	return substance;
}

Substance.findByKey = function*(key){
	var result,substance;
	result = yield Model.getByKey(key.toLowerCase());
	if(result){
		if(key.toLowerCase() == "dha"){
			console.log('in controller',result);
		}
		substance = new Substance(result,true);
		return substance;
		
	}else{
	  return false;
	}
//	console.log(substance);
}

Substance.instantSearch = function*(string) {
	var result;
	result = yield Model.search(string);
	return result;
}

Substance.prototype.save = function*(){
	var result,data;
	yield this.normalizeKeys();
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

Substance.prototype.normalizeKeys = function*(){
	function trim_ (str) {
		var noDuplicado = str.replace(/\s{1,}/g, ' ');
		var leftRight = noDuplicado.replace(/^\s+|\s+$/g,"");
		return leftRight;

	}

//	function replaceSpecialChars(str){
//			str = str.replace(/[ÀÁÂÃÄÅ]/g,"A");
//			str = str.replace(/[àáâãäå]/g,"a");
//			str = str.replace(/[ÈÉÊË]/g,"E");
//			str = str.replace(/[èéê]/g,"e");
//			str = str.replace(/[Ç]/g,"C");
//			str = str.replace(/[ç]/g,"c");
//			str = str.replace(/[óòõ]/g,"o");
//			str = str.replace(/[ÒÓÔÕ]/g,"O");
//			str = str.replace(/[íí]/g,"i");
//			str = str.replace(/[ÌÍ]/g,"I");
//		
//			return str; 
//		}
	
//	if(this.newSubstance) {
//		this.newSubstance = false;
//		this.keys.forEach(function(key){
//			key = key.toLowerCase();
//		})
		var unnormalized = this.keys;
		var normalized = [];
		unnormalized.forEach(function(key){
			var trimed = trim_(key);
			
			normalized.push(trimed.toLowerCase());	
			
		})
		this.keys = normalized;
//	}
}

Substance.prototype.init = function(force) {
	
	Object.defineProperty(this, 'keys',{
		get: function() {
			this.newSubstance = false;
			return this._keys;
			
		},
		set: function(keys) {
			this._keys = keys;
			if(!force){
				this.newSubstance = true;
			}
		}
	});
}

module.exports = Substance;