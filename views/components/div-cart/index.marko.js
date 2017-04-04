// Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = ({
    onCreate: function (input) {
        this.state = {
            cart: [],
            frete: 0,
            total: 0,
            id: ''
        };
    },
    onInput: function (input) {
        return {
            size: input.size || 'normal',
            variant: input.variant || 'primary',
            body: input.label || input.renderBody,
            className: input['class'],
            mode: input.mode || '',
            frete: input.frete || 0,
            total: input.total || 0,
            cart: input.cart || []
        };
    },
    onMount: function () {
        var self = this;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://behealthbrasil.com.br/api/order/cart', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            if (this.readyState != 4)
                return false;
            if (this.status == 200) {
                console.log('return from GET MOUNT', this);
                if (this.responseText != 'OK' && this.responseText != '{}') {
                    var order = JSON.parse(this.responseText);
                    if (!Array.isArray(order)) {
                        self.state.cart = order.cart;
                        self.state.id = order.id;
                        var newTotal = 0;
                        self.state.cart.forEach(function (item) {
                            newTotal += item.qtd * item.price;
                        });
                        self.state.total = newTotal;
                        self.setStateDirty('total');
                    }
                }
            }
        };
        xhr.send();
        pubsub.on('setQtd', function (data) {
            if (self.input.mode == 'page') {
                self.state.cart[data.target].qtd = data.value;
                var total = 0;
                console.log(self.state.cart);
                for (var i = 0; i < self.state.cart.length; i++) {
                    console.log('item', self.state.cart[i]);
                    if (self.state.cart[i].label != 'Formula não Listada') {
                        total += self.state.cart[i].qtd * self.state.cart[i].price;
                        console.log('total', total);
                    }
                }
                self.state.total = total;
                self.setStateDirty('total');
            }
        });
        if (this.input.mode == 'summary') {
            pubsub.on('onSendPayment', function () {
                var data = {
                    amount: self.state.total,
                    id: self.state.id
                };
                console.log('sending payment', data);
                $.ajax({
                    url: 'https://behealthbrasil.com.br/api/pay2',
                    type: 'POST',
                    data: JSON.stringify(data),
                    processData: false,
                    contentType: 'application/json',
                    success: function (data) {
                        console.info('files', data);
                        window.location.assign(data);
                    }
                });
            });
        }
        pubsub.on('onAddCartItem', function (data) {
            self.state.cart.push(data.item);
            self.setStateDirty('cart');
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://behealthbrasil.com.br/api/order/cart', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.onreadystatechange = function () {
                if (this.readyState != 4)
                    return false;
                if (this.status == 200) {
                    console.log('return from GET', this.responseText);
                    self.state.cart = JSON.parse(this.responseText).cart;
                    self.state.id = JSON.parse(this.responseText).id;
                    var newTotal = 0;
                    if (self.state.cart && self.state.cart.length > 0) {
                        self.state.cart.forEach(function (item) {
                            newTotal += item.qtd * item.price;
                        });
                    }
                    self.state.total = newTotal;
                    self.setStateDirty('total');
                }
            };
            var data = { cart: self.state.cart };
            xhr.send(JSON.stringify(data));
        });
        pubsub.on('onRemoveCartItem', function (index) {
            self.state.cart.splice(index, 1);
            self.setStateDirty('cart');
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://behealthbrasil.com.br/api/order/cart', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.onreadystatechange = function () {
                if (this.readyState != 4)
                    return false;
                if (this.status == 200) {
                    console.log('return from GET', this.responseText);
                    self.state.cart = JSON.parse(this.responseText).cart;
                    self.state.id = JSON.parse(this.responseText).id;
                    var newTotal = 0;
                    if (self.state.cart && self.state.cart.length > 0) {
                        self.state.cart.forEach(function (item) {
                            newTotal += item.qtd * item.price;
                        });
                    }
                    self.state.total = newTotal;
                    self.setStateDirty('total');
                }
            };
            var data = { cart: self.state.cart };
            xhr.send(JSON.stringify(data));
        });
        Number.prototype.formatMoney = function (c, d, t) {
            var n = this, c = isNaN(c = Math.abs(c)) ? 2 : c, d = d == undefined ? '.' : d, t = t == undefined ? ',' : t, s = n < 0 ? '-' : '', i = String(parseInt(n = Math.abs(Number(n) || 0).toFixed(c))), j = (j = i.length) > 3 ? j % 3 : 0;
            return s + (j ? i.substr(0, j) + t : '') + i.substr(j).replace(/(\d{3})(?=\d)/g, '$1' + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : '');
        };
    },
    remove: function (index) {
        pubsub.emit('onRemoveCartItem', index);
    },
    handleClick: function (event) {
        this.emit('click', { event: event });
    }
}),
    marko_components = require("marko/components"),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/div-cart/index.marko", function() {
      return module.exports;
    }),
    pubsub = require("raptor-pubsub"),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_escapeXml = marko_helpers.x,
    marko_forEachProp = require("marko/runtime/helper-forEachProperty"),
    marko_attr = marko_helpers.a,
    marko_loadTemplate = require("marko/runtime/helper-loadTemplate"),
    app_number_spinner_template = marko_loadTemplate(require.resolve("../app-number-spinner")),
    marko_loadTag = marko_helpers.t,
    app_number_spinner_tag = marko_loadTag(app_number_spinner_template);

function render(input, out, __component, component, state) {
  var data = input;

  out.w("<div" +
    marko_attr("id", __component.id) +
    ">");

  if (input.mode == "dropdown") {
    out.w("<div class=\"dropdown dropdown-cart\"><a href=\"#\" class=\"dropdown-toggle\" data-toggle=\"dropdown\"><i class=\" icon-basket-1\"></i> Cart ");

    if ((state.cart != "undefined") && (state.cart != null)) {
      out.w("(" +
        marko_escapeXml(state.cart.length) +
        ")");
    }

    out.w("</a>");

    if (((state.cart != "undefined") && (state.cart != null)) && (state.cart.length > 0)) {
      out.w("<ul class=\"dropdown-menu\" id=\"cart_items\">");

      marko_forEachProp(state.cart, function(i, item) {
        out.w("<li><div class=\"image\" style=\"width:90px;\">" +
          marko_escapeXml(item.label) +
          "</div><strong style=\"width:110px;\"><a href=\"#\">R$ " +
          marko_escapeXml((item.qtd * item.price).formatMoney(2, ",", ".")) +
          " </a> por " +
          marko_escapeXml(item.qtd) +
          " " +
          marko_escapeXml(item.unid) +
          " x R$ " +
          marko_escapeXml(item.price.formatMoney(2, ",", ".")) +
          " </strong><a href=\"#\" class=\"action\"><i class=\"icon-trash\"" +
          marko_attr("data-_onclick", __component.d("remove", [
            i
          ]), false) +
          "></i></a></li>");
      });

      out.w("<li><div>Total: <span>R$ " +
        marko_escapeXml(state.total.formatMoney(2, ",", ".")) +
        "</span></div><a href=\"/cart\" class=\"button_drop\">Ver carrinho</a></li></ul>");
    }

    out.w("</div>");
  }

  if (input.mode == "page") {
    out.w("<table class=\"table table-striped cart-list add_bottom_30\"><thead><tr><th>Item</th><th>Quantidde</th><th>Preço unitário</th><th>Total</th><th></th></tr></thead><tbody>");

    marko_forEachProp(state.cart, function(i, item) {
      out.w("<tr><td>" +
        marko_escapeXml(item.label) +
        "</td><td>");

      app_number_spinner_tag({
          value: item.qtd,
          index: i
        }, out);

      out.w(" x " +
        marko_escapeXml(item.unidade) +
        "</td><td>" +
        marko_escapeXml(item.price.formatMoney(2, ",", ".")) +
        "</td><td><strong>R$ " +
        marko_escapeXml((item.price * item.qtd).formatMoney(2, ",", ".")) +
        "</strong></td><td class=\"options\"><a href=\"#\"><i class=\" icon-trash\"></i></a><a href=\"#\"><i class=\"icon-ccw-2\"></i></a></td></tr>");
    });

    out.w("</tbody></table><div><span class=\"price-value\">R$ " +
      marko_escapeXml(state.total.formatMoney(2, ",", ".")) +
      "</span><span class=\"mo\"> o melhor preço </span></div>");
  }

  if (input.mode == "summary") {
    out.w("<table class=\"table table_summary\"><tbody><tr><td>Pedido</td><td class=\"text-right\">R$ " +
      marko_escapeXml(state.total.formatMoney(2, ",", ".")) +
      "</td></tr><tr><td>Frete</td><td class=\"text-right\">R$ " +
      marko_escapeXml(state.frete.formatMoney(2, ",", ".")) +
      "</td></tr><tr class=\"total\"><td>Total</td><td class=\"text-right\">R$ " +
      marko_escapeXml((state.total + state.frete).formatMoney(2, ",", ".")) +
      "</td></tr></tbody></table>");
  }

  out.w("</div>");
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

marko_template.meta = {
    deps: [
      "./style.less",
      {
          type: "css",
          code: ".price-value {\n    font-size: 32px;\n    font-weight: 600;\n\n  }\n\n  .mo{\n    padding: 2px 4px;\n    border: 2px solid #82ca9c;\n    margin-left: 9px;\n    top: -6px;\n    position: relative;\n    color: white;\n    font-weight: 600;\n    background: #82ca9c;\n  }",
          virtualPath: "./index.marko.css",
          path: "./index.marko"
        },
      {
          type: "require",
          path: "./"
        }
    ],
    tags: [
      "../app-number-spinner"
    ]
  };
