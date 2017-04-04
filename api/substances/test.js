"use strict"
let	app = require("../../"),
	assert = require('assert'),
	Substance = require('../substances/'),
	r = require('../../utils/rethinkdb.js')(),
	TABLE = 'substances';

require('co-mocha');

describe('Testing our Substance component', function () {
	
	beforeEach(function*(){
		yield r.table(TABLE)
			.delete()
			.run();
	})
	
	it('shoud create a substance', function*() {
		var substance = new Substance();
		assert.equal(typeof substance, 'object');		
	})
	
	it('shoud store the properties in the Sunstance object', function*() {
		var keys;
		keys = ['omega3','4'];
		var substance = new Substance({keys: keys});
		assert.equal(substance.keys, keys);		
	})
	
	it('shoud have an id after being saved', function*() {
		var keys;
		keys = ['omega3','4'];
		var substance = new Substance({keys: keys});
		yield substance.save();
		assert(substance.id);
	})
	
	it('shoud find a set of keys', function*() {
		var keys,founded;
		keys = ['omega3','4'];
		var substance = new Substance({keys: keys});
		yield substance.save();
		founded = yield Substance.findByKey(keys[0]);
//		console.log(JSON.stringify(founded,null,4));
		assert(founded.keys[0], keys[0]);
	})
	
	it('shoud have all keys be in lower case', function*() {
		var keys,childs,founded;
		keys =['omega 3','omega3','omega três'];
		var substance = new Substance({keys: keys});
		yield substance.save();
		founded = yield Substance.findByKey(keys[0]);
		assert(founded.keys[0], keys[0].toLowerCase());
	})
	
	it('shoud find in any tipe of font format, lower or uppercase', function*() {
		var keys,founded;
		keys = ['ôMega 3','4'];
		var substance = new Substance({keys: keys});
		yield substance.save();
		founded = yield Substance.findByKey('omega 3');
		assert(founded.keys[0], keys[0].toLowerCase());
	})
	
	it('shoud find yours child', function*() {
		var keys,childs,unid,founded;
		keys =['omega 3','omega3','omega três'];
		childs = {
					connector: "sendo",
					substances:["DHP","PCP"]
				};
		unid = "g";
		var substance = new Substance({keys: keys, unid:unid, childs:childs});
		yield substance.save();
		founded = yield Substance.findByKey(keys[0]);
		assert(founded.childs.connector, childs.connector);
		assert(founded.childs.substances.length, 2);
	})
	
	it('shoud have diferent created_at and updated at', function *() {
		var keys,childs,unid,founded;
		keys =['omega 3','omega3','omega três'];
		childs = {
					connector: "sendo",
					substances:["DHP","PCP"]
				};
		unid = "g";
		var substance = new Substance({keys: keys, unid:unid, childs:childs});
		yield substance.save();
		founded = yield Substance.findByKey(keys[0]);
		founded.keys.push('outro omega');
		yield founded.save();
		
		founded =  yield Substance.findByKey(keys[0]);
		assert.notEqual(founded.created_at.valueOf(),founded.updated_at.valueOf());
		
	})
	
	it('shoud return a array of substances', function*() {
		var properties, user,retrieveUser;
		
		var keys,childs,unid,founded;
		keys = ['omega 3','omega3','omega três'];
		childs = {
					connector: "sendo",
					substances:["DHP","PCP"]
				};
		unid = "g";
		var substance = new Substance({keys: keys, unid:unid, childs:childs});
		yield substance.save();
		var substance = new Substance({keys: ['alguma key']});
		yield substance.save();
		
		founded = yield Substance.findAllSubstances();
		
		assert((typeof founded, 'array') && founded.length == 2 );
	})
	
	it('shoud return a instant search results', function*() {		
		var keys,childs,unid,strings,founded_1,founded_2,founded_3;
		keys = ['omega 3','omega3','omega três'];
		childs = {
					connector: "sendo",
					substances:["DHP","PCP"]
				};
		unid = "g";
		
		var substance = new Substance({keys: ['omega 3'], unid:unid, childs:childs});
		yield substance.save();
		
		var substance = new Substance({keys: ['omteriz'], unid:unid, childs:childs});
		yield substance.save();
		
		var substance = new Substance({keys: ['oteriz'], unid:unid, childs:childs});
		yield substance.save();
		
		strings = ['o','om','ome'];
		
		founded_1 = yield Substance.instantSearch(strings[0]);
		founded_2 = yield Substance.instantSearch(strings[1]);
		founded_3 = yield Substance.instantSearch(strings[2]);

		assert((typeof founded_1, 'array') && founded_1.length == 3 );
		assert((typeof founded_2, 'array') && founded_2.length == 2 );
		assert((typeof founded_3, 'array') && founded_3.length == 1 );
	})
});

