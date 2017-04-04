"use strict"
let	app = require("../"),
	_ = require('lodash'),
	request = require('co-supertest'),
	assert = require('assert'),
	User = require('../users/'),
	Session = require('./'),
	r = require('../../utils/rethinkdb.js')(),
	TABLE = 'sessions',
	server = app.listen();

require('co-mocha');


describe('Testing our session component and authorization', function () {
	var agent;
	before(function*(){
		agent = request.agent(server);
		yield r.table(TABLE)
			.delete()
			.run();
	})
	
	beforeEach(function*(){
		yield r.table('users')
			.delete()
			.run();
	})
	
	it('shoud return the request body', function *() {
		yield agent
			.post('/testBody')
			.send({content:'somevalue'})
			.expect(200)
			.expect(/"content":"somevalue"/)
			.end();
	})
	
	it('shoud set a User', function *() {
		var email,fullName,user,findUser,savedUser;
		email = 'Lucas@';
		fullName = 'Lucas gomes';
		
		user = new User({email:email,fullName:fullName});
		yield user.save();
		findUser = yield User.findByEmail(email);
		assert.equal(findUser.email, email.toLowerCase());		
	})
	
	it('shoud set a session for authenticated user', function *() {
		//salvando um usuario para poder autenthica-lo
		var email,fullName,password,user,findUser,savedUser;
		email = 'Lucas@';
		fullName = 'Lucas gomes';
		password = 'secret'
		user = new User({email:email,fullName:fullName,password:password});
		yield user.save();
		
		//autenticando
		yield agent
			.post('/signin')
			.send({email:email,password:password})
			.expect(200)
			.expect(user.id)
			.end()
	})

	it('shoud NOT set a session for authenticated user', function *() {
		//salvando um usuario para poder autenthica-lo
		var email,fullName,password,user,findUser,savedUser;
		email = 'Lucas@';
		fullName = 'Lucas gomes';
		password = 'secret'
		user = new User({email:email,fullName:fullName,password:password});
		yield user.save();
		
		//autenticando
		yield agent
			.post('/signin')
			.send({email:email,password:'wrongpass'})
			.expect(401)
			.expect('unauthorized')
			.end()
	})

	it('shoud logout a loged user', function *() {
		//salvando um usuario para poder autenthica-lo
		var email,fullName,password,user,findUser,savedUser;
		email = 'Lucas@';
		fullName = 'Lucas gomes';
		password = 'secret'
		user = new User({email:email,fullName:fullName,password:password});
		yield user.save();
		
		//autenticando
		yield agent
			.post('/signin')
			.send({email:email,password:password})
			.end()

		yield agent
			.post('/signin')
			.send({logout:true})
			.expect(205)
			.end();

	})

	it('shoud return from session the actual user', function *() {
		//salvando um usuario para poder autenthica-lo
		var email,fullName,password,user,findUser,savedUser;
		email = 'Lucas@';
		fullName = 'Lucas gomes';
		password = 'secret'
		user = new User({email:email,fullName:fullName,password:password});
		yield user.save();
		
		//autenticando
		yield agent
			.post('/signin')
			.send({email:email,password:password})
			.expect(200)
			.expect(user.id)
			.end()
		
		yield agent
			.get('/custumer/user')
			.expect(200)
			.expect(user.fullName)
			.end()
	})
	
	it('shoud return a no user message after logout', function *() {
		//salvando um usuario para poder autenthica-lo
		var email,fullName,password,user,findUser,savedUser;
		email = 'Lucas@';
		fullName = 'Lucas gomes';
		password = 'secret'
		user = new User({email:email,fullName:fullName,password:password});
		yield user.save();
		
		//autenticando
		yield agent
			.post('/signin')
			.send({email:email,password:password})
			.end()

		yield agent
			.post('/signin')
			.send({logout:true})
			.expect(205)
			.end();
		
		yield agent
			.get('/custumer/user')
			.expect(401)
			.expect('no user')
			.end();
	})
	
	it('shoud set a consumer user', function *() {
		//salvando um usuario para poder autenthica-lo
		var newUser;
		
		newUser = {
			email:'lucasB@gmail',
			role:1,
			password:'oath',
			fullName: 'Lucas Gomes',
			cel:11951
		}
		
		yield agent
			.post('/signup')
			.send(newUser)
			.expect(201)
			.end()
		
		//autenticando
		yield agent
			.post('/signin')
			.send(newUser)
			.expect(200)
			.end()
		
		yield agent
			.get('/custumer/user')
			.expect(200)
			.expect(newUser.fullName)
			.end()
	})
	
	//	it('shoud not get autorization', function *() {
	//	//autenticando
	//		yield agent
	//			.post('/signin')
	//			.send({logout:true})
	//			.expect(205)
	//			.end()
	//		
	//		yield agent
	//			.get('/custumer/user')
	//			.expect(401)
	//			.expect('no user')
	//			.end();
	//	})
});

const _session = {
	"id":  "f539a03e-a021-4583-b8ef-ddf675053ea1", 
	"created_at": r.now(),
	"updated_at": r.now(),
	"token":  "hUjLkBCQOwKsj7tDT4dFlWyaEeO0XxCS" ,
	"user":  "id_do_usuario_logado"
}
