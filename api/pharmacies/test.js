"use strict"
let	app = require("../../"),
	assert = require('assert'),
	User = require('../users/'),
	Pharmacie =require('./'),
	r = require('../../utils/rethinkdb.js')(),
	TABLES = ['pharmacies','users'];

require('co-mocha');

describe('Testing our phamacie component', function () {
	
	beforeEach(function *(){
		yield r.table(TABLES[0])
			.delete()
			.run();
		
		yield r.table(TABLES[1])
			.delete()
			.run();
	})
	
	it('shoud create a user as pharmacie entity and store propeties', function *() {
		var data = {
			//auth
			"email": 'mayara.azevedo@gmail.com', 
			"password":  "secret" ,
			"role": 1 ,

			//data
			"firstname":  "Mayara" ,
			"fullname":  "Mayara Azevedo" ,
			"tel": 11900001111 ,
			 CPF:	1101010101,
			
			"PayPal":  "idDoPayPal" ,

			//data
			"shotName":  "Farmais" ,
			"CNPJ": 1101000101001 ,
			"brand":  "urlimage.png" ,
			"legalName":  "Farmais ltda"
		};
		var pharmacie = new Pharmacie(data);
//		console.log(pharmacie)
		yield pharmacie.save();
		
		assert.equal(typeof pharmacie, 'object');		
	})
	
	it('shoud have an id after being saved', function *() {
		var pharmacie, data;
		data = {
			//auth
			"email": 'mayara.azevedo@gmail.com', 
			"password":  "secret" ,
			"role": 2 ,

			//data
			"firstname":  "Mayara" ,
			"fullname":  "Mayara Azevedo" ,
			"tel": 11900001111 ,
			 CPF:	1101010101,
			
			"PayPal":  "idDoPayPal" ,

			//data
			"shotName":  "Farmais" ,
			"CNPJ": 1101000101001 ,
			"brand":  "urlimage.png" ,
			"legalName":  "Farmais ltda"
		};
		
		pharmacie = new Pharmacie(data);
		yield pharmacie.save();
		
		assert(pharmacie.id);
	})
	
	it('shoud math id of user and user propertie', function *() {
		var pharmacie, data;
		data = {
			//auth
			"email": 'mayara.azevedo@gmail.com', 
			"password":  "secret" ,
			"role": 2 ,

			//data
			"firstname":  "Mayara" ,
			"fullname":  "Mayara Azevedo" ,
			"tel": 11900001111 ,
			CPF:	1101010101,
			
			"PayPal":  "idDoPayPal" ,

			//data
			"shotName":  "Farmais" ,
			"CNPJ": 1101000101001 ,
			"brand":  "urlimage.png" ,
			"legalName":  "Farmais ltda"
		};
		
		pharmacie = new Pharmacie(data);
		yield pharmacie.save();
		
		assert(pharmacie.user,pharmacie._user.id);
	})
	
	it('shoud find a pharmacie by your user email', function *() {
		var pharmacie, data,found;
		data = {
			//auth
			"email": 'Mayara.azevedo@gmail.com', 
			"password":  "secret" ,
			"role": 2 ,

			//data
			"firstname":  "Mayara" ,
			"fullname":  "Mayara Azevedo" ,
			"tel": 11900001111 ,
			CPF:	1101010101,
			
			"PayPal":  "idDoPayPal" ,

			//data
			"shotName":  "Farmais" ,
			"CNPJ": 1101000101001 ,
			"brand":  "urlimage.png" ,
			"legalName":  "Farmais ltda"
		};
		
		pharmacie = new Pharmacie(data);
		yield pharmacie.save();
		
		found = yield Pharmacie.findByEmail(data.email);
		assert.equal(found._user.email, data.email.toLowerCase());
	})
//	
//	it('shoud have a hashed password after being saved', function *() {
//		var email,password, user;
//		email = 'Lucas@';
//		password = 'secret';
//		user = new User({email:email,password:password});
//		yield user.save();
//		assert.notEqual(user.password, password);
//	})
//	
//	it('shoud validate a correct password', function *() {
//		var email,password, user;
//		email = 'Lucas@';
//		password = '123456';
//		user = new User({email:email,password:password});
//		yield user.save();
//		assert(yield user.isPassword(password));
//	})
//	
//	it('shoud validate an incorrect password', function *() {
//		var email,password, user;
//		email = 'Lucas@';
//		password = '123456';
//		user = new User({email:email,password:password});
//		yield user.save();
//		assert( !(yield user.isPassword('wrongpassword')) );
//	})
//	
//	it('shoud insert a complete user', function *() {
//		var properties, user,retrieveUser;
//		
//		properties = {
//			email:'Lucas@',
//			password:'12345',
//			role:'1',
//			key:'value'
//		}
//		
//		user = new User(properties);
//		yield user.save();
//		retrieveUser =  yield User.findByUserEmail(properties.email);
//		assert(retrieveUser.role && !retrieveUser.key);
//	})
//	
//	it('shoud have a lowercase email', function *() {
//		var properties, user,retrieveUser;
//		
//		properties = {
//			email:'Lucas@',
//			password:'12345',
//			role:'1',
//			key:'value'
//		}
//		
//		user = new User(properties);
//		yield user.save();
//		retrieveUser =  yield User.findByUserEmail(properties.email);
//		assert.equal(retrieveUser.email,properties.email.toLowerCase());
//	})
//	
//	it('shoud have diferent created_at and updated at', function *() {
//		var properties, user, retrieveUser;
//		
//		properties = {
//			email:'Lucas@',
//			password:'12345',
//			role:'1',
//			key:'value'
//		}
//		
//		user = new User(properties);
//		yield user.save();
//		retrieveUser =  yield User.findByUserEmail(properties.email);
//		
//		retrieveUser.fullName = 'Lucas Badico';
//		yield retrieveUser.save();
//		
//		retrieveUser =  yield User.findByUserEmail(properties.email);
//		assert.notEqual(retrieveUser.created_at.valueOf(),retrieveUser.updated_at.valueOf());
//	})
//	
//	it('shoud return a array of users', function *() {
//		var properties, user,retrieveUser;
//		
//		properties = [
//			{
//				email:'Lucas@',
//				password:'12345',
//				role:'1',
//				key:'value'
//			},
//			{
//				email:'Erika@',
//				password:'12345',
//				role:'1',
//				key:'value'
//			}
//		]
//		
//		user = new User(properties[0]);
//			yield user.save();
//		user = new User(properties[1]);
//			yield user.save();
//		retrieveUser =  yield User.findAllUsers();
//		assert((typeof retrieveUser, 'array') && retrieveUser.length == 2 );
//	})
	
});

const _user = {
	//base
	"created_at": 'Sun Feb 05 2017 15:26:12 GMT+00:00' ,
	"updated_at": 'Sun Feb 05 2017 15:26:12 GMT+00:00',
	"id":  "ab200997-bd8f-4d1e-a4e8-7937e71465a1" ,
	
	//auth
	"email": 'mayara.azevedo@gmail.com', 
	"password":  "secret" ,
	"role": 1 ,
	
	//data
	"firstname":  "Mayara" ,
	"fullname":  "Mayara Azevedo" ,
	"tel": 11900001111 ,
}

const _pharma = {
	//base
	"created_at": 'Sun Feb 05 2017 15:26:12 GMT+00:00',
	"updated_at": 'Sun Feb 05 2017 15:26:12 GMT+00:00',
	"id":  "a7eca81e-2e11-42bc-81ee-496461dfaada" ,
	
	//ref
	"user":  "8bcd8ee9-284f-4894-bb5f-5072cb08d3ea",
	"PayPal":  "idDoPayPal" ,
	
	//data
	"shotName":  "Farmais" ,
	"CNPJ": 1101000101001 ,
	"brand":  "urlimage.png" ,
	"legalName":  "Farmais ltda"

}
