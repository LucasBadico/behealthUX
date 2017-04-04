// Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = ({
    onCreate: function (input) {
    },
    onInput: function (input) {
    },
    callModalLogin: function (event) {
        pubsub.emit('showModal', {});
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
    }
}),
    marko_components = require("marko/components"),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/layout-header/index.marko", function() {
      return module.exports;
    }),
    pubsub = require("raptor-pubsub"),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_attr = marko_helpers.a,
    marko_escapeXml = marko_helpers.x,
    marko_loadTemplate = require("marko/runtime/helper-loadTemplate"),
    comp_menu_template = marko_loadTemplate(require.resolve("../comp-menu")),
    marko_loadTag = marko_helpers.t,
    comp_menu_tag = marko_loadTag(comp_menu_template);

function render(input, out, __component, component, state) {
  var data = input;

  out.w("<header" +
    marko_attr("id", __component.id) +
    "><div id=\"top_line\"><div class=\"container\"><div class=\"row\"><div class=\"col-md-6 col-sm-6 col-xs-12\"></div><div class=\"col-md-6 col-sm-6 col-xs-12\"><ul id=\"top_links\">");

  if (!out.global.currentUser) {
    out.w("<li><a href=\"#\"" +
      marko_attr("data-_onclick", __component.d("callModalLogin", [
        {
            data: "valor"
          }
      ]), false) +
      ">Olá, <strong>faça seu login!</strong></a></li>");
  } else {
    out.w("<li>Olá <strong><a href=\"/profile\">" +
      marko_escapeXml(out.global.currentUser.firstName) +
      "</a></strong>, parabéns por ser #health</li>");
  }

  if (out.global.currentUser) {
    out.w("<li><a href=\"#\"" +
      marko_attr("data-_onclick", __component.d("doLogout"), false) +
      ">Logout</a></li>");
  }

  out.w("</ul></div></div></div></div><div class=\"container\"><div class=\"row\"><div class=\"col-md-5 col-sm-3 col-xs-3\"><div id=\"logo\"><a href=\"/home\"><img src=\"img/logo_white.png\" width=\"160\" height=\"34\" alt=\"City tours\" data-retina=\"true\" class=\"logo_normal\"></a><a href=\"/home\"><img src=\"img/logo_sticky.png\" width=\"160\" height=\"34\" alt=\"City tours\" data-retina=\"true\" class=\"logo_sticky\"></a></div></div>");

  comp_menu_tag({}, out);

  out.w("</div></div></header>");
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

marko_template.meta = {
    deps: [
      "./style.less",
      {
          type: "require",
          path: "./"
        }
    ],
    tags: [
      "../comp-menu"
    ]
  };
