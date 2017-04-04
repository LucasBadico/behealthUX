"use strict"
let	app = require("../../"),
	assert = require('assert'),
	User = require('../users/'),
	r = require('../../utils/rethinkdb.js')(),
	TABLE = 'users';

require('co-mocha');

describe('Testing our user component', function () {
	
	beforeEach(function *(){
		yield r.table(TABLE)
			.delete()
			.run();
	})
	
	it('shoud create a user', function *() {
		var user = new User();
		assert.equal(typeof user, 'object');		
	})
	
	it('shoud store the properties in the user object', function *() {
		var email, user;
		email = 'Lucas';
		user = new User({email:email});
		assert.equal(user.email, email);		
	})
	
	it('shoud have an id after being saved', function *() {
		var email,password, user;
		email = 'Lucas@';
		password = 'secret';
		user = new User({email:email,password:password});
		yield user.save();
		assert(user.id);
	})
	
	it('shoud find a saved user by user email', function *() {
		var foundUser,email,password, user;
		email = 'Lucas@';
		password = 'secret';
		user = new User({email:email,password:password});
		yield user.save();
		foundUser = yield User.findByEmail(email);
		assert(foundUser.email, email);
	})
	
	it('shoud have a hashed password after being saved', function *() {
		var email,password, user;
		email = 'Lucas@';
		password = 'secret';
		user = new User({email:email,password:password});
		yield user.save();
		assert.notEqual(user.password, password);
	})
	
	it('shoud validate a correct password', function *() {
		var email,password, user;
		email = 'Lucas@';
		password = '123456';
		user = new User({email:email,password:password});
		yield user.save();
		assert(yield user.isPassword(password));
	})
	
	it('shoud validate an incorrect password', function *() {
		var email,password, user;
		email = 'Lucas@';
		password = '123456';
		user = new User({email:email,password:password});
		yield user.save();
		assert( !(yield user.isPassword('wrongpassword')) );
	})
	
	it('shoud insert a complete user', function *() {
		var properties, user,retrieveUser;
		
		properties = {
			email:'Lucas@',
			password:'12345',
			role:'1',
			key:'value'
		}
		
		user = new User(properties);
		yield user.save();
		retrieveUser =  yield User.findByEmail(properties.email);
		assert(retrieveUser.role && !retrieveUser.key);
	})
	
	it('shoud have a lowercase email', function *() {
		var properties, user,retrieveUser;
		
		properties = {
			email:'Lucas@',
			password:'12345',
			role:'1',
			key:'value'
		}
		
		user = new User(properties);
		yield user.save();
		retrieveUser =  yield User.findByEmail(properties.email);
		assert.equal(retrieveUser.email,properties.email.toLowerCase());
	})
	
	it('shoud have diferent created_at and updated at', function *() {
		var properties, user, retrieveUser;
		
		properties = {
			email:'Lucas@',
			password:'12345',
			role:'1',
			key:'value'
		}
		
		user = new User(properties);
		yield user.save();
		retrieveUser =  yield User.findByEmail(properties.email);
		
		retrieveUser.fullName = 'Lucas Badico';
		yield retrieveUser.save();
		
		retrieveUser =  yield User.findByEmail(properties.email);
		assert.notEqual(retrieveUser.created_at.valueOf(),retrieveUser.updated_at.valueOf());
	})
	
	it('shoud return a array of users', function *() {
		var properties, user,retrieveUser;
		
		properties = [{
			email:'Lucas@',
			password:'12345',
			role:'1',
			key:'value'
		},{
			email:'Erika@',
			password:'12345',
			role:'1',
			key:'value'
		}]
		
		user = new User(properties[0]);
		yield user.save();
		user = new User(properties[1]);
		yield user.save();
		retrieveUser =  yield User.findAllUsers();
		assert((typeof retrieveUser, 'array') && retrieveUser.length == 2 );
	})
	
});

const _user = {
	"created_at": 'Sun Feb 05 2017 15:26:12 GMT+00:00' ,
	"email": 'mayara.azevedo@gmail.com', 
	"firstname":  "Mayara" ,
	"fullname":  "Mayara Azevedo" ,
	"id":  "ab200997-bd8f-4d1e-a4e8-7937e71465a1" ,
	"password":  "secret" ,
	"role": 1 ,
	"tel": 11900001111 ,
	"updated_at": 'Sun Feb 05 2017 15:26:12 GMT+00:00'
}
