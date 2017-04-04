"use strict";
var template = {};
Number.prototype.formatMoney = function(c, d, t){
        var n = this,
            c = isNaN(c = Math.abs(c)) ? 2 : c,
            d = d == undefined ? "." : d,
            t = t == undefined ? "," : t,
            s = n < 0 ? "-" : "",
            i = String(parseInt(n = Math.abs(Number(n) || 0).toFixed(c))),
            j = (j = i.length) > 3 ? j % 3 : 0;
           return s + (j ? i.substr(0, j) + t : "") + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : "");
         };
template.welcome = function(data){
	
return `
<html>
	<body>
		<h1>
			Olá ${data.firstName}, seja bem vindo a #behealth;
		</h1>
	</body>
</html>

`
}

template.order = function(order){
	var total = 0;
	order.cart.forEach(item => total += item.price*item.qtd)
return `
<html>
	<body>
		<h1>
			Seu pedido foi recebido
		</h1>
		<p>você  tem ${order.id}</p>

		<div>

 ${order.cart.map( item =>  `${item.label}<div>${item.qtd} ${item.unidade} | Preço: R$ ${(item.price*item.qtd).formatMoney(2, ',', '.')} <br>Composição:  ${item.composition}</div>`)}
		</div>

		<p>Total: R$ ${total.formatMoney(2,',','.')}</p>
	</body>
</html>

`
}

template.orderWithoutUser = function(order){
return `
<html>
	<body>
		<h1>
			Estamos levantando o orçamento do seu pedido
		</h1>
		<p>O numero do seu pedido é ${order.id}</p>

		<div>

 ${order.cart.map( item =>  `${JSON.stringify(item)}`)}
		</div>

	</body>
</html>

`
}


module.exports =  template;
