var	r = require('../../utils/rethinkdb.js')(),
	_ = require('lodash'),
	Model = require('./model.js');

var File = function(properties,force){
	this.init(force);
	_.assign(this, properties);
}

File.findAllFiles = function*(rest){
	var result, array;
	
	array = yield Model.getAll();
	
	if(rest){
		result = array;
		
	}else{
		result = [];
		
		array.forEach(function(item, index){
			let file = new File(item,true);
			result.push(file);
		})
	}
	
	return result;
}

File.findById = function*(id){
	var result,file;
	result = yield Model.getById(id);
	if(result){
		file = new File(result,true)
	}
	
	return file;
}


File.prototype.save = function*(){
	var result,data;
//	yield this.normalizeKeys();
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



File.prototype.init = function(force) {
	
//	Object.defineProperty(this, 'keys',{
//		get: function() {
//			this.newFile = false;
//			return this._keys;
//			
//		},
//		set: function(keys) {
//			this._keys = keys;
//			if(!force){
//				this.newFile = true;
//			}
//		}
//	});
}

module.exports = File;