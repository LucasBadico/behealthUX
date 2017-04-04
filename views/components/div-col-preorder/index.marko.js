// Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = ({
    onCreate: function (input) {
        this.state = {
            messageType: '',
            messageBody: '',
            message: false,
            mode: 'login',
            thisid: input.thisid
        };
        if (input.email) {
            var data = {
                email: input.email,
                preorder: this.state.thisid
            };
            this.sendPreOrder(data);
        }
    },
    hideModal: function (event) {
        pubsub.emit('hideModal', {});
    },
    onInput: function (input) {
        console.log(input);
        return {
            size: input.size || 'normal',
            variant: input.variant || 'primary',
            body: input.label || input.renderBody,
            className: input['class'],
            mode: input.mode || 'default',
            thisid: input.thisid || '',
            email: input.email || ''
        };
    },
    sendPreOrder: function (data) {
        var self = this;
        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://behealthbrasil.com.br/api/order/' + data.preorder, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            console.log(this.readyState, this.status);
            if (this.readyState != 4)
                return false;
            if (this.status == 200) {
                self.state.message = true;
                self.state.messageType = 'success';
                self.state.messageBody = 'Recebemos seus dados, parabéns por ser #HEALTH';
                setTimeout(function () {
                    window.location.assign('/home');
                }, 2000);
            }
        };
        xhr.send(JSON.stringify(data));
    },
    getPreOrder: function (event) {
        var self = this;
        event.preventDefault();
        var data = {
            email: document.getElementById('email2').value,
            preorder: this.state.thisid
        };
        this.sendPreOrder(data);
        console.log(data);
    }
}),
    marko_components = require("marko/components"),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/div-col-preorder/index.marko", function() {
      return module.exports;
    }),
    pubsub = require("raptor-pubsub"),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_escapeXml = marko_helpers.x,
    marko_classAttr = marko_helpers.ca,
    marko_attr = marko_helpers.a;

function render(input, out, __component, component, state) {
  var data = input;

  out.w("<div" +
    marko_classAttr([
      input.className
    ]) +
    marko_attr("id", __component.id) +
    "><div id=\"login\"><div class=\"text-center\"><img src=\"img/logo_sticky.png\" alt=\"\" data-retina=\"true\"></div><hr>");

  if (!input.email) {
    out.w("<strong style=\"text-align:center;\">Ótimo agora só precisamos do seu email para enviar o seu orçamento.</strong>");
  } else {
    out.w("<strong style=\"text-align:center;\">Estamos enviando um orçamento para o seu email " +
      marko_escapeXml(input.email) +
      "</strong>");
  }

  if (state.message) {
    out.w("<div" +
      marko_classAttr([
        "message",
        state.messageType
      ]) +
      ">" +
      marko_escapeXml(state.messageBody) +
      "</div>");
  }

  if (!input.email) {
    out.w("<form><div class=\"form-group\"><label>Email</label><input type=\"text\" class=\" form-control \" placeholder=\"Email\" id=\"email2\"></div><a href=\"#\" class=\"btn_full_outline\"" +
      marko_attr("data-_onclick", __component.d("getPreOrder"), false) +
      ">Receber orçamento</a></form>");
  }

  out.w("<a href=\"#\" class=\"close-link\"" +
    marko_attr("data-_onclick", __component.d("hideModal"), false) +
    ">fechar</a></div></div>");
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
          code: ".message {\n    background-color: lightgoldenrodyellow;\n    font-weight: 600;\n    text-align: center;\n    padding: 3px 0;\n    border-radius: 5px;\n    margin-bottom: 14px;\n  }\n\n  .error {\n    color: white;\n    background-color: red;\n  }\n\n  .close-link{\n    text-align: center;\n    display: block;\n    margin-top: 10px;\n    font-weight: 700;\n    text-transform: uppercase;\n  }",
          virtualPath: "./index.marko.css",
          path: "./index.marko"
        },
      {
          type: "require",
          path: "./"
        }
    ]
  };
