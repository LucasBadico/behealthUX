// Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = ({
    onCreate: function (input) {
        this.state = {
            messageType: '',
            messageBody: '',
            message: false,
            mode: 'login'
        };
    },
    hideModal: function (event) {
        pubsub.emit('hideModal', {});
    },
    onInput: function (input) {
        return {
            size: input.size || 'normal',
            variant: input.variant || 'primary',
            body: input.label || input.renderBody,
            className: input['class'],
            mode: input.mode || 'default'
        };
    },
    doLogout: function (event) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://behealthbrasil.com.br/api/signin', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            if (this.readyState != 4)
                return;
            if (this.status == 205) {
                console.log('response', this.responseText);
                window.location.assign('/home');
            }
        };
        var sendData = JSON.stringify({ logout: true });
        console.log(sendData);
        xhr.send(sendData);
    },
    doLogin: function (event) {
        var state = this.state;
        var user = {
            email: document.getElementById('email').value,
            password: document.getElementById('password').value
        };
        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://behealthbrasil.com.br/api/signin', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            if (this.readyState != 4)
                return;
            if (this.status == 200) {
                state.message = true;
                state.messageType = 'success';
                state.messageBody = 'Login efetuado com sucesso, vamos ser #HEALTH hoje?';
                console.log('response', this.responseText);
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
        var sendData = JSON.stringify(user);
        console.log(sendData);
        xhr.send(sendData);
        this.emit('click', { event: event });
    },
    doRegister: function (event) {
        event.preventDefault();
        var user = {
            fullName: document.getElementById('fullnameR').value,
            email: document.getElementById('emailR').value,
            password: document.getElementById('passwordR').value,
            firstName: document.getElementById('fullnameR').value.split(' ')[0]
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
    },
    goto: function (destine) {
        this.state.mode = destine;
    }
}),
    marko_components = require("marko/components"),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/div-col-login/index.marko", function() {
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

  if (!out.global.currentUser) {
    out.w("<form>");

    if (state.mode == "login") {
      out.w("<div class=\"form-group\"><label>Email</label><input type=\"text\" class=\" form-control \" placeholder=\"Email\" id=\"email\"></div><div class=\"form-group\"><label>Senha</label><input type=\"password\" class=\" form-control\" placeholder=\"Senha\" id=\"password\"></div><p class=\"small\"><a href=\"#\">esqueceu sua senha?</a></p><a href=\"#\" class=\"btn_full\"" +
        marko_attr("data-_onclick", __component.d("doLogin"), false) +
        ">Login</a><a href=\"#\" class=\"btn_full_outline\"" +
        marko_attr("data-_onclick", __component.d("goto", [
          "register"
        ]), false) +
        ">Cadastrar</a>");
    } else {
      out.w("<div class=\"form-group\"><label>Nome completo</label><input type=\"text\" class=\"form-control\" placeholder=\"Nome completo\" id=\"fullnameR\"></div><div class=\"form-group\"><label>Email</label><input type=\"email\" class=\"form-control\" placeholder=\"Email\" id=\"emailR\" autocomplete=\"off\"></div><div class=\"form-group\"><label>Senha</label><input type=\"password\" class=\"form-control\" id=\"passwordR\" placeholder=\"Senha\"></div><button class=\"btn_full\"" +
        marko_attr("data-_onclick", __component.d("doRegister"), false) +
        ">Registrar</button><a href=\"#\" class=\"btn_full_outline\"" +
        marko_attr("data-_onclick", __component.d("goto", [
          "login"
        ]), false) +
        ">Logar</a>");
    }

    out.w("</form>");
  } else {
    out.w("<a href=\"#\" class=\"btn_full\"" +
      marko_attr("data-_onclick", __component.d("doLogout"), false) +
      ">Logout</a>");
  }

  if (input.mode == "modal") {
    out.w("<a href=\"#\" class=\"close-link\"" +
      marko_attr("data-_onclick", __component.d("hideModal"), false) +
      ">fechar</a>");
  }

  out.w("</div></div>");
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
