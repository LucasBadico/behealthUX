"use strict"
require('./configure');

var path = require('path');

let koa = require('koa'),
	mount = require('koa-mount'),
	router = require('koa-router'),
	serve = require('koa-static'),
	views = require('co-views'),
	compress = require('koa-compress'),
//	session = require('./api/session/'),
	viewsRouter = require('./router.js'),
	app = module.exports = koa();


app.keys = ['behealth.homolog'];
//app.use(session());
// =========================================================
// Middleware
// =========================================================

	//Middleware: request logger
	function*reqlogger(next){
	  console.log('%s - %s %s',new Date().toISOString(), this.req.method, this.req.url);
	  yield next;
	}
	app.use(reqlogger);

// =========================================================
// Mount path
// =========================================================
	//core api
//	let api = require('./api/'); 
//		app.use(mount('/api', api));

// ==========================================================
// Views
// ==========================================================

	// compressão
	app.use(compress( {flush: require('zlib').Z_SYNC_FLUSH} ));

	// css, js, img's
	app.use(serve(__dirname + '/public'));
	
	// rotas
	app.use(viewsRouter.routes())
	   .use(viewsRouter.allowedMethods());



// ==========================================================
// Listning
// ==========================================================
 
	app.listen(3000);