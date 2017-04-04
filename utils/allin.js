"use strict"
var request = require('co-request'),
	co = require('co');

var token;

function AllInCall(a,b) {
	request('http://transacional.allin.com.br/api/?method=get_token&output=json&username=behealth&password=JYS$zed$', function (error, response, body) {
		token = JSON.parse(body).token;

		//call next function
		return a(b);	
	});
}

function writeToken() {
	console.log(token)
}

function sendEmail(a){
	var sample_data = {
				"nm_envio":a.envio,
                "nm_email":a.toEmail,
                "html": new Buffer(a.html).toString('base64'),
                "nm_subject":a.subjective,
                "nm_remetente":a.remetente,
                "email_remetente":a.remetenteEmail,
                "nm_reply":a.remetenteReply,
                "dt_envio":a.data,
                "hr_envio":a.hora
 }
	var formData = {dados:sample_data};
	
	console.log(formData);
	
	request.post({url:'https://transacional.allin.com.br/api/?method=enviar_email&output=json&encode=UTF8&token=' + token,form:{dados: JSON.stringify(sample_data)}}, 
				 	function(err,httpResponse,body){
						console.log(body);
					})	
}

var conection = {};

conection.sendEmail = function(dataETemplate){
	AllInCall(sendEmail,dataETemplate)
} 

module.exports =  conection;
