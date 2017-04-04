	var	r = require('../../utils/rethinkdb.js')()
	_ = require('lodash'),
	Model = require('./model.js');
	User = require('../users/');
var user_;


var Pharmacie = function(properties, force){ 
	this._user = new User(properties,force);
	
	_.assign(this, properties);

}

Pharmacie.findByEmail = function*(email){
	var result,user,pharmacie;

	result = yield Model.getByEmail(email);

	if(result && result.length === 1){
		pharmacie = new Pharmacie(result[0],true)
	}
	
	return pharmacie;
}

Pharmacie.prototype.save = function*(){
	var result,	data, user;
	
	yield this._user.save();
	
	// primeiro vamos verificar se a Pharmacie tem uma propriedade user
	if(!this.user){
		//se não tem adicionar
		this.user = this._user.id;
		
	}
	
	// selecionar os dados para guardar no model Pharmacie
	data = _.pick(this,Model.SCHEMA());

	//checa se o objeto Pharmacie já existe
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

Pharmacie.prototype.init = function(force) {
//	Object.defineProperty(this, 'email',{
//		get: function() {
//			this.newUser = false;
//			return this._email;
//			
//		},
//		set: function(email) {
//			this._email = email;
//			if(!force){
//				this.newUser = true;
//			}
//		}
//	});
}

module.exports = Pharmacie;