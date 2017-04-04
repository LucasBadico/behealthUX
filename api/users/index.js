var	r = require('../../utils/rethinkdb.js')(),
	bcrypt = require('co-bcryptjs'),
	_ = require('lodash'),
	Model = require('./model.js');

var User = function(properties,force){
	this.init(force);
	_.assign(this, properties);
}

User.findAllUsers = function*(rest){
	var result, array;
	
	array = yield Model.getAll();
	
	if(rest){
		result = array;
		
	}else{
		result = [];
		
		array.forEach(function(item, index){
			let user = new User(item,true);
			result.push(user);
		})
	}
	
	return result;
}

User.findById = function*(id){
	var result,user;
	result = yield Model.getById(id);
	if(result){
		user = new User(result,true)
	}
	
	return user;
}

User.findByEmail = function*(email){
	var result,user;
	result = yield Model.getByEmail(email);
	console.log('result',result);
	if(result && result.length === 1){
		user = new User(result[0],true)
	}else{
		user = false;
	}
	
	return user;
}

User.prototype.normalizeEmail = function*(){
	if(this.newUser) {
		this.newUser = false;
		this.email = this.email.toLowerCase();
	}
}

User.prototype.save = function*(){
	var result,data;
	yield this.normalizeEmail();
	yield this.hashPassword();
	
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

User.prototype.hashPassword = function*(){
	if(this.newPassword){
		this.newPassword = false;
		var salt = yield bcrypt.genSalt(10);
		this.password = yield bcrypt.hash(this.password, salt);
	}
	
}

User.prototype.isPassword = function*(password){
	return yield bcrypt.compare(password,this.password);
}

User.prototype.init = function(force) {
	Object.defineProperty(this, 'password',{
		get: function() {
			this.newPassword = false;
			return this._password;
		},
		set: function(password) {
			this._password = password;
			if(!force){
				this.newPassword = true;
			}
		}	
	});
	
	Object.defineProperty(this, 'email',{
		get: function() {
			this.newUser = false;
			return this._email;
			
		},
		set: function(email) {
			this._email = email;
			if(!force){
				this.newUser = true;
			}
		}
	});
	
	//this.created = true;
}

module.exports = User;