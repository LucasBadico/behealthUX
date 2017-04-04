// Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = ({
    onCreate: function (input) {
        this.state = {
            cart: [],
            total: 0,
            class: function (i) {
                if (i == input.step) {
                    return 'active';
                }
                if (i < input.step) {
                    return 'complete';
                }
                if (i > input.step) {
                    return 'disabled';
                }
            }
        };
    },
    onInput: function (input) {
        console.log(input.step);
        return {
            size: input.size || 'normal',
            variant: input.variant || 'primary',
            body: input.label || input.renderBody,
            className: input['class'] || '',
            step: input['step'] || 1,
            text: input['text'] || '',
            type: input['type'] || '',
            id: input['id'] || ''
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
                if (this.responseText != 'OK') {
                    self.state.cart = JSON.parse(this.responseText);
                    var newTotal = 0;
                    self.state.cart.forEach(function (item) {
                        newTotal += item.qtd * item.price;
                    });
                    self.state.total = newTotal;
                    self.setStateDirty('total');
                }
            }
        };
        xhr.send();
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
                    self.state.cart = JSON.parse(this.responseText);
                    var newTotal = 0;
                    self.state.cart.forEach(function (item) {
                        newTotal += item.qtd * item.price;
                    });
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
    handleClick: function (event) {
        this.emit('click', { event: event });
    }
}),
    marko_components = require("marko/components"),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/section-steps/index.marko", function() {
      return module.exports;
    }),
    pubsub = require("raptor-pubsub"),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_escapeXml = marko_helpers.x,
    marko_classAttr = marko_helpers.ca,
    marko_attr = marko_helpers.a;

function render(input, out, __component, component, state) {
  var data = input;

  out.w("<section" +
    marko_attr("id", __component.id) +
    ">");

  if (input.step != 1) {
    out.w("<div class=\"intro_title animated fadeInDown\"><h1 style=\"margin-top: 8%;\">Status do seu pedido</h1>");

    if (input.text) {
      out.w("<p" +
        marko_classAttr([
          "message",
          input.type
        ]) +
        ">" +
        marko_escapeXml(input.text) +
        "</p>");
    }

    out.w("<div class=\"bs-wizard\"><div" +
      marko_classAttr([
        "col-xs-2",
        "bs-wizard-step",
        state.class(1)
      ]) +
      "><div class=\"text-center bs-wizard-stepnum\">Seu carrinho</div><div class=\"progress\"><div class=\"progress-bar\"></div></div><a href=\"cart.html\" class=\"bs-wizard-dot\"></a></div><div" +
      marko_classAttr([
        "col-xs-2",
        "bs-wizard-step",
        state.class(2)
      ]) +
      "><div class=\"text-center bs-wizard-stepnum\">Pagamento</div><div class=\"progress\"><div class=\"progress-bar\"></div></div><a href=\"/checkout\" class=\"bs-wizard-dot\"></a></div><div class=\"col-xs-2 bs-wizard-step disabled\"><div class=\"text-center bs-wizard-stepnum\">Receitas</div><div class=\"progress\"><div class=\"progress-bar\"></div></div><a href=\"/checkout\" class=\"bs-wizard-dot\"></a></div><div class=\"col-xs-2 bs-wizard-step disabled\"><div class=\"text-center bs-wizard-stepnum\">Produzido</div><div class=\"progress\"><div class=\"progress-bar\"></div></div><a href=\"/checkout\" class=\"bs-wizard-dot\"></a></div><div class=\"col-xs-2 bs-wizard-step disabled\"><div class=\"text-center bs-wizard-stepnum\">Transporte</div><div class=\"progress\"><div class=\"progress-bar\"></div></div><a href=\"confirmation.html\" class=\"bs-wizard-dot\"></a></div><div class=\"col-xs-2 bs-wizard-step disabled\"><div class=\"text-center bs-wizard-stepnum\">Recebido</div><div class=\"progress\"><div class=\"progress-bar\"></div></div><a href=\"confirmation.html\" class=\"bs-wizard-dot\"></a></div></div> ");

    if (input.step > 1) {
      out.w("<p class=\"pedido\">Pedido: " +
        marko_escapeXml(input.id) +
        " </p>");
    }

    out.w("</div> ");
  } else {
    out.w("<div class=\"intro_title animated fadeInDown\"><h1 style=\"margin-top: 8%;\">Status do seu pedido</h1>");

    if (input.text) {
      out.w("<p" +
        marko_classAttr([
          "message",
          input.type
        ]) +
        ">" +
        marko_escapeXml(input.text) +
        "</p>");
    }

    out.w("<div class=\"bs-wizard\"><div" +
      marko_classAttr([
        "col-xs-2",
        "bs-wizard-step",
        "active"
      ]) +
      "><div class=\"text-center bs-wizard-stepnum\">Seu carrinho</div><div class=\"progress\"><div class=\"progress-bar\"></div></div><a href=\"cart.html\" class=\"bs-wizard-dot\"></a></div><div" +
      marko_classAttr([
        "col-xs-2",
        "bs-wizard-step",
        "disabled"
      ]) +
      "><div class=\"text-center bs-wizard-stepnum\">Pagamento</div><div class=\"progress\"><div class=\"progress-bar\"></div></div><a href=\"/checkout\" class=\"bs-wizard-dot\"></a></div><div class=\"col-xs-2 bs-wizard-step disabled\"><div class=\"text-center bs-wizard-stepnum\">Receitas</div><div class=\"progress\"><div class=\"progress-bar\"></div></div><a href=\"/checkout\" class=\"bs-wizard-dot\"></a></div><div class=\"col-xs-2 bs-wizard-step disabled\"><div class=\"text-center bs-wizard-stepnum\">Produzido</div><div class=\"progress\"><div class=\"progress-bar\"></div></div><a href=\"/checkout\" class=\"bs-wizard-dot\"></a></div><div class=\"col-xs-2 bs-wizard-step disabled\"><div class=\"text-center bs-wizard-stepnum\">Transporte</div><div class=\"progress\"><div class=\"progress-bar\"></div></div><a href=\"confirmation.html\" class=\"bs-wizard-dot\"></a></div><div class=\"col-xs-2 bs-wizard-step disabled\"><div class=\"text-center bs-wizard-stepnum\">Recebido</div><div class=\"progress\"><div class=\"progress-bar\"></div></div><a href=\"confirmation.html\" class=\"bs-wizard-dot\"></a></div></div> ");

    if (input.step > 1) {
      out.w("<p class=\"pedido\">Pedido: " +
        marko_escapeXml(input.id) +
        " </p>");
    }

    out.w("</div> ");
  }

  out.w("</section>");
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType,
    id: "hero_2"
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

marko_template.meta = {
    deps: [
      "./style.less",
      {
          type: "css",
          code: ".pedido {\n      display: -webkit-inline-box;\n      position: relative;\n      text-align: left;\n    }\n\n    .message {\n      background-color: lightgoldenrodyellow;\n      font-weight: 400;\n      text-align: center;\n      padding: 3px 15px;\n      border-radius: 5px;\n      margin-bottom: 25px;\n      color: black;\n      display: inline-block;\n      font-size: 14px;\n    }\n\n    .error {\n      color: white;\n      background-color: red;\n      font-weight: 500;\n    }\n\n    .warning {\n        color: red;\n        background-color: yellow;\n      }\n\n    .waiting {\n\n    }",
          virtualPath: "./index.marko.css",
          path: "./index.marko"
        },
      {
          type: "require",
          path: "./"
        }
    ]
  };
