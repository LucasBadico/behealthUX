const Paypal = require('paypal-express-checkout-simple');
let router = require('koa-router'),
	views = require('co-views'),
	bodyParser = require('koa-bodyparser'),
	_ = require('lodash'),
    compress  = require('koa-compress'),
    marko     = require('marko'),
	request = require('koa-request'),
	PayPal2 = require('paypal-express-checkout');

	var viewsRouter = router();

	// NOTE
	//Redirects to home
	viewsRouter.get('/',function*(){
		this.redirect('/home')
	})
	
	viewsRouter.get('/home',function*(){
		var template = require('./views/pages/home/template.marko');
		var	user;
//		if(this.session.user){
//			user = yield User.findById(this.session.user);
//		}
//		

		template.render({
				$global: { 
						currentUser: user
				}	
			},
			this.res);
	})
	
	viewsRouter.get('/login',function*(){
		var	user;
//		if(this.session.user){
//			user = yield User.findById(this.session.user);
//		}
		
		this.body = marko.load('./views/pages/login/template.marko').stream({
		  $global: { 
			currentUser: user
		  }
		})
		
		this.type = 'text/html'
	})
	
	viewsRouter.post('/tryPost', function*(){
		console.log(this.request.body);
		this.body = this.request.body;
	})
	
	viewsRouter.get('/register',function*(){
		var	user;
//		if(this.session.user){
//			user = yield User.findById(this.session.user);
//		}
		
		this.body = marko.load('./views/pages/register/template.marko').stream({
		  $global: { 
			currentUser: user
		  }
		})
		this.type = 'text/html'
	})
	
	viewsRouter.get('/cart',function*(){
		var	user;
//		if(this.session.user){
//			user = yield User.findById(this.session.user);
//		}
		
		this.body = marko.load('./views/pages/cart/template.marko').stream({
		  $global: { 
			currentUser: user
		  }
		})
		this.type = 'text/html'
	})
	
	viewsRouter.get('/checkout',function*(){
		var	user;
//		if(this.session.user){
//			user = yield User.findById(this.session.user);
//		}
		
		this.body = marko.load('./views/pages/checkout/template.marko').stream({
		  $global: { 
			currentUser: user
		  }
		})
		this.type = 'text/html'
	})
//	
//	viewsRouter.get('/confirmation',function*(){
//	console.log(this.req.url);
//		var url = this.req.url;
//		var t = /token\=/, p = /&PayerID\=/;
//		var token = url.match(t),payer = url.match(p);
//		var Token =  url.slice(token.index+6,payer.index), Payer = url.slice(payer.index+9);
//		
//		var order;
//		if(this.session.user){
//			console.log('session.user GET -> ', this.session.user);
//			order = yield Order.findInPaying(this.session.user);
//			
//		}else{
//			console.log('session.token GET -> ', this.session.token);
//			order = yield Order.findInPaying(this.session.token);
//		}
//		
//		const paypal2 = PayPal2.init('contratos_api1.behealthbrasil.com.br', 'HANLTNBQUS73LC7Y', 'AFcWxV21C7fd0v3bYYYRCpSSRl31AmXHhTEQfagUjb8J7fLR3E1Hc-qF', 'http://localhost:3000/confirmation', 'http://localhost:3000/error');
//		
//		var order;
//			if(this.session.user){
//				console.log('session.user GET -> ', this.session.user);
//				order = yield Order.findInPaying(this.session.user);
//
//			}
//			else{
//				console.log('session.token GET -> ', this.session.token);
//				order = yield Order.findInPaying(this.session.token);
//			}
//	
//		
//		function finishPayment(d) {
//			console.log(d.id, d.amount, 'pedido - Behealth brasil', 'BRL')
//			return new Promise(function(resolve, reject) {
//				
//			paypal2.detail(d.Token, d.Payer, function(err, data, invoiceNumber, price) {
//
//			if (err) {
//				return reject(err);
//				
//			}
//
//			// data.success == {Boolean}
//
//			if (data.success){
//				var data_ = {
//					err:err,
//					data: data,
//					invoiceNumber: invoiceNumber,
//					price: price
//				}
//				resolve(data_)
////				console.log('DONE, PAYMENT IS COMPLETED.',err, data, invoiceNumber, price);
////				order.status = 'sucess';
//				
//			}	
//			else {
//				var data_ = {
//					err:err,
//					data: data,
//					invoiceNumber: invoiceNumber,
//					price: price
//				}
//				console.log('SOME PROBLEM:', err, data, invoiceNumber, price);
//				return reject(data_);
//				
//			}
//			
//
//			/*
//			data (object) =
//			{ TOKEN: 'EC-35S39602J3144082X',
//			  TIMESTAMP: '2013-01-27T08:47:50Z',
//			  CORRELATIONID: 'e51b76c4b3dc1',
//			  ACK: 'Success',
//			  VERSION: '52.0',
//			  BUILD: '4181146',
//			  TRANSACTIONID: '87S10228Y4778651P',
//			  TRANSACTIONTYPE: 'expresscheckout',
//			  PAYMENTTYPE: 'instant',
//			  ORDERTIME: '2013-01-27T08:47:49Z',
//			  AMT: '10.00',
//			  TAXAMT: '0.00',
//			  CURRENCYCODE: 'EUR',
//			  PAYMENTSTATUS: 'Pending',
//			  PENDINGREASON: 'multicurrency',
//			  REASONCODE: 'None' };
//			*/
//
//		});
//		}
//		)}
//							   
//		var tData = {
//						Token: Token,
//						Payer: Payer
//					}
//		
//		var transaction = yield finishPayment(tData);
//			if(transaction.data.sucess){
//				order.status = 'sucess';
//				
//			}else{
//				
//				order.status = 'error';
//			}
//			order.paypal = {
//				id:transaction.data.TRANSACTIONID,
//				type:transaction.data.TRANSACTIONTYPE,
//				data:transaction.data
//			}
//			yield order.save();
//							   
//							   
//		var	user;
//		if(this.session.user){
//			user = yield User.findById(this.session.user);
//		}
//		
//		this.body = marko.load('./views/pages/confirmation/template.marko').stream({
//		  $global: { 
//			currentUser: user
//		  }
//		})
//		this.type = 'text/html'
//	})
//	
	viewsRouter.get('/404',  function*(){
		var	user;
//		if(this.session.user){
//			user = yield User.findById(this.session.user);
//		}
		
		this.body = marko.load('./views/pages/404/template.marko').stream({
		  $global: { 
			currentUser: user
		  }
		})
		this.type = 'text/html'
		
	})

module.exports = viewsRouter;
		