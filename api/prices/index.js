var	r = require('../../utils/rethinkdb.js')(),
	bcrypt = require('co-bcryptjs'),
	_ = require('lodash'),
	Model = require('./model.js');

var Price = function(properties,force){
	this.init(force);
	_.assign(this, properties);
}

Price.findAllPrices = function*(rest){
	var result, array;
	
	array = yield Model.getAll();
	
	if(rest){
		result = array;
		
	}else{
		result = [];
		
		array.forEach(function(item, index){
			let price = new Price(item,true);
			result.push(price);
		})
	}
	
	return result;
}

Price.findById = function*(id){
	var result,price;
	result = yield Model.getById(id);
	if(result){
		price = new Price(result,true)
	}
	
	return price;
}

Price.findByProductAndSeller = function*(product,seller){
	var result,price;
	result = yield Model.getPriceByProductAndSeller(product,seller);
	if(result){
		price = new Price(result,true)
	}
	
	return price;
}

Price.findBySeller = function*(sellerId){
	var result,price,array;
	array = yield Model.getPricesBySeller(sellerId);
	result = [];
	
	if(array){
		
		array.forEach(function(item, index){
			let price = new Price(item,true);
			result.push(price);
		})
	}
	
	return result;
}

Price.findByProduct = function*(productId){
	var result,price,array;
	array = yield Model.getPricesByProduct(productId);
	result = [];
	
	if(array){
		
		array.forEach(function(item, index){
			let price = new Price(item,true);
			result.push(price);
		})
	}
	
	return result;
}

Price.prototype.save = function*(){
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

Price.prototype.init = function(force) {
//	Object.defineProperty(this, 'password',{
//		get: function() {
//			this.newPassword = false;
//			return this._password;
//		},
//		set: function(password) {
//			this._password = password;
//			if(!force){
//				this.newPassword = true;
//			}
//		}	
//	});
	
}

module.exports = Price;