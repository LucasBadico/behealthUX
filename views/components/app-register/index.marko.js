// Compiled using marko@4.1.0 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = ({
    onCreate: function (input) {
        this.state = {
            messageType: '',
            messageBody: '',
            message: false
        };
    },
    onInput: function (input) {
        return {
            size: input.size || 'normal',
            variant: input.variant || 'primary',
            body: input.label || input.renderBody,
            className: input['class']
        };
    },
    doRegister: function (event) {
        event.preventDefault();
        var user = {
            fullName: document.getElementById('fullname_R').value,
            email: document.getElementById('email_R').value,
            password: document.getElementById('password_R').value,
            firstName: document.getElementById('fullname_R').value.split(' ')[0]
        };
        var state = this.state;
        console.log(user);
        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://behealthbrasil.com.br/api/signup', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            console.log(this.readyState, this.status);
            if (this.readyState != 4)
                return false;
            if (this.status == 201) {
                state.message = true;
                state.messageType = 'success';
                state.messageBody = 'Cadastro efetuado com sucesso, Parabéns por ser #HEALTH';
                setTimeout(function () {
                    window.location.assign('/home');
                }, 2000);
            }
            if (this.status == 401) {
                state.message = true;
                state.messageType = 'error';
                state.messageBody = this.status + ' - ' + this.responseText;
            }
        };
        xhr.send(JSON.stringify(user));
        this.emit('click', { event: event });
    }
}),
    marko_components = require("marko/components"),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/app-register/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_escapeXml = marko_helpers.x,
    marko_classAttr = marko_helpers.ca,
    marko_attr = marko_helpers.a;

function render(input, out, __component, component, state) {
  var data = input;

  var variantClassName = (input.variant !== 'primary' && 'app-button-' + input.variant);

  var sizeClassName = (input.size !== 'normal' && 'app-button-' + input.size);

  out.w("<section" +
    marko_attr("id", __component.id) +
    " class=\"login\"><div class=\"container\"><div class=\"row\"><div class=\"col-md-4 col-md-offset-4 col-sm-6 col-sm-offset-3\"><div id=\"login\"><div class=\"text-center\"><img src=\"img/logo_sticky.png\" alt=\"\" data-retina=\"true\"></div><hr>");

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

  out.w("<form><div class=\"form-group\"><label>Nome completo</label><input type=\"text\" class=\" form-control\" placeholder=\"Nome completo\" id=\"fullname_R\"></div><div class=\"form-group\"><label>Email</label><input type=\"email\" class=\" form-control\" placeholder=\"Email\" id=\"email_R\"></div><div class=\"form-group\"><label>Senha</label><input type=\"password\" class=\" form-control\" id=\"password_R\" placeholder=\"Senha\"></div><div id=\"pass-info\" class=\"clearfix\"></div><button class=\"btn_full\"" +
    marko_attr("data-_onclick", __component.d("doRegister"), false) +
    ">Registrar</button></form></div></div></div></div></section>");
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType,
    id: "hero"
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

marko_template.meta = {
    deps: [
      "./style.less",
      {
          type: "css",
          code: ".message {\n    background-color: lightgoldenrodyellow;\n    font-weight: 600;\n    text-align: center;\n    padding: 3px 0;\n    border-radius: 5px;\n    margin-bottom: 14px;\n  }\n\n  .error {\n    color: white;\n    background-color: red;\n  }",
          virtualPath: "./index.marko.css",
          path: "./index.marko"
        },
      {
          type: "require",
          path: "./"
        }
    ]
  };
