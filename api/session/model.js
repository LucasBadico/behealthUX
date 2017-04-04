'use strict';
//let dash = require('rethinkdbdash');

const DB_NAME = 'betest';
const TABLE_NAME = 'sessions';
const TOKEN_FIELD_NAME = 'token';

let r = require('../../utils/rethinkdb.js')();

module.exports = {
	add: function *add(token,session) {
		session[TOKEN_FIELD_NAME] = token;
		session['user'] = session.user;
		session['role'] = session.role;
		session['created_at'] = r.now();
		session['updated_at'] = r.now();
		return yield r.table(TABLE_NAME)
			.insert(session)
			.run();		
	},
	findByToken: function *findByToken(token) {
		let filter, session, result;
		 filter = {};
		 filter[TOKEN_FIELD_NAME] = token;
		 result = yield r.table(TABLE_NAME)
			.filter(filter)
			.run();
		if(result && result.length === 1) {
			session = result[0];
		}
		
		return session;
	},
	update: function *update(token, session) {
		
		let filter = {};
		session[TOKEN_FIELD_NAME] = token;
		session['user'] = session.user;
		session['role'] = session.role;
		session['updated_at'] = r.now();
		filter[TOKEN_FIELD_NAME] = token;
		
		return yield r.table(TABLE_NAME)
			.filter(filter)
			.update(session)
			.run();
	},
	remove: function *remove(token) {
		
		let filter = {};
		filter[TOKEN_FIELD_NAME] = token;
		return yield r.table(TABLE_NAME)
			.filter(filter)
			.delete()
			.run();
	},
	tryMigrate: function *tryMigrate() {
		try {
			yield r.dbCreate(DB_NAME).run();
			yield r.tableCrete(TABLE_NAME).run();
			yield r.table(TABLE_NAME).indexCreate(TOKEN_FIELD_NAME);
		}
		catch(err) {
			
		}
	}
}