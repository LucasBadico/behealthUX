// Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = {
        onInput: function(input) {
          return {
              size: input.size || "normal",
              variant: input.variant || "primary",
              body: input.label || input.renderBody,
              className: input["class"]
            };
        },
        handleClick: function(event) {
          this.emit("click", {
              event: event
            });
        }
      },
    marko_components = require("marko/components"),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/group-box-icons/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_attr = marko_helpers.a;

function render(input, out, __component, component, state) {
  var data = input;

  var variantClassName = (input.variant !== 'primary' && 'app-button-' + input.variant);

  var sizeClassName = (input.size !== 'normal' && 'app-button-' + input.size);

  out.w("<div class=\"row\"" +
    marko_attr("id", __component.id) +
    "><div class=\"col-md-4 wow zoomIn\" data-wow-delay=\"0.2s\"><div class=\"feature_home\"> <i class=\"icon-truck-1\"></i><h3>Frete <span>GRÁTIS</span></h3><p><a href=\"#\"> para pedidos feitos nos estabelecimentos da sua região </a></p></div></div><div class=\"col-md-4 wow zoomIn\" data-wow-delay=\"0.4s\"><div class=\"feature_home\"> <i class=\" icon-money-2\"></i><h3><span>Compromisso</span> sempre</h3><p> <a href=\"#\"> O menor preço garantido. Aqui a gente cobre qualquer oferta.</a> </p></div></div><div class=\"col-md-4 wow zoomIn\" data-wow-delay=\"0.6s\"><div class=\"feature_home\"> <i class=\" icon-newspaper-1\"></i><h3>Venha ser <span>#BeHealth</span> </h3><p><a href=\"https://blog.behealthbrasil.com.br\" target=\"_blank\"> Acompanhe o blog da maior rede de saúde e bem estar</a> </p></div></div></div>");
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
    ]
  };
