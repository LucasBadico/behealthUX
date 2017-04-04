'use strict';
let _ = require('lodash'),
	uid = require('uid-safe'),
	model = require('./model.js');

module.exports = function(options) {
	let store = {};
	let cookiename = 'koa.sid';
	let cookieoptions = {
		httpOnly:true,
		path:'/',
		overwrite:true,
		signed:true,
		maxAge: 24 * 60 * 60 * 1000		
	};
	
	let isMigrated = false;
	
	function *loadSession(ctx) {
		
		var token = ctx.cookies.get(cookiename);
		if(token){
			ctx.session = yield model.findByToken(token);
		}
		
		if(!ctx.session){
			ctx.session = {};
		}
		//console.log('Session', ctx.session);
		
		return token;
	}
	
	function *saveSession(ctx, token) {
		let isNew = false;
		
		if(!token){
			isNew = true;
			token = yield uid(24);
			ctx.cookies.set(cookiename,token,cookieoptions); 
			if(ctx.session) {
				
				if(isNew) {
					yield model.add(token, ctx.session)
				}
				else {
					yield model.update(token, ctx.session)	
				}
			}
			
		}else if(ctx.session){
			yield model.update(token, ctx.session)	
			
		}
		
		
		if(!ctx.session) {
			ctx.cookies.set(cookiename,null); 
			yield model.remove(token); 
		}
		
	}
	
	return function *session(next) {
		if(!isMigrated) {
			yield model.tryMigrate();
			isMigrated = true;
		}
		
		var token = yield loadSession(this);
		
		yield next;
				
		yield saveSession(this, token);
		
	}
}