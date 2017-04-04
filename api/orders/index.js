var	r = require('../../utils/rethinkdb.js')(),
	_ = require('lodash'),
	Model = require('./model.js');

var Order = function(properties,force){
	this.init(force);
	_.assign(this, properties);
}

Order.findAllOrders = function*(rest){
	var result, array;
	
	array = yield Model.getAll();
	
	if(rest){
		result = array;
		
	}else{
		result = [];
		
		array.forEach(function(item, index){
			let substance = new Order(item,true);
			result.push(substance);
		})
	}
	
	return result;
}

Order.findById = function*(id){
	var result,substance;
	result = yield Model.getById(id);
	if(result){
		substance = new Order(result,true)
	}
	
	return substance;
}

Order.findInPaying = function*(user){
	var result, order;
	result = yield Model.getPaying(user);
	console.log(result);
	if(result.length > 0){
		order = new Order(result[0],true);
		
	}else{
		order = [];
		
	}
	console.log('return from index',order);
	return order;
}
Order.findCart = function*(user){
	var result, order;
	result = yield Model.getCart(user);
	console.log(result);
	if(result.length > 0){
		order = new Order(result[0],true);
		
	}else{
		order = [];
		
	}
	console.log('return from index',order);
	return order;
	
}

Order.prototype.save = function*(){
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



Order.prototype.init = function(force) {
	
//	Object.defineProperty(this, 'keys',{
//		get: function() {
//			this.newOrder = false;
//			return this._keys;
//			
//		},
//		set: function(keys) {
//			this._keys = keys;
//			if(!force){
//				this.newOrder = true;
//			}
//		}
//	});
}

module.exports = Order;