var Auth = function (){
	
};

Auth.isAuth =  function(){
		return function*(next){
			console.log(this);
			if(typeof this.session.user !== 'undefined'){
				//se há um usuario registrado na sessão segue para a próxima rota
				yield next;
			}else{
				//se não not authorized é devolvido e não  segue pra próxima rota
				this.body = 'no user'
				//call here 401 page
				
				this.status = 401;
				yield next;
			}
		}
	};

Auth.isGranted =	function(i){
		return function*(next){
			if(this.session.role == i){
				//se o role da sessão é igual ao necessario para acessar a próxima ROTA
				yield next;
			}else{
				//se não not authorized é devolvido e não segue pra próxima rota
//				this.body = 'no user'
				this.status = 401;
				
				yield next;
			}
		}
	};

Auth.handle = function(){
	return function*(next){
	  if (401 != this.status) return;
	  this.redirect('/login');
		yield next
	}
}
Auth.isRole = function(){
	return this.session.role;
} 
module.exports = Auth;