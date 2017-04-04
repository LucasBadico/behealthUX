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
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/group-notebook-list/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_attr = marko_helpers.a;

function render(input, out, __component, component, state) {
  var data = input;

  out.w("<div class=\"row\"" +
    marko_attr("id", __component.id) +
    "><div class=\"col-md-8 col-sm-6 hidden-xs\"> <img src=\"img/laptop.png\" alt=\"Laptop\" class=\"img-responsive laptop\"> </div><div class=\"col-md-4 col-sm-6\"><h3 style=\"font-size:16px;\"><span>Experimente</span> comprar com a Behealth</h3><ul class=\"list_order\"><li style=\"font-size: 20px;\"><span>1</span> Insira as substâncias do seu medicamento ou envie a sua receita</li><li style=\"font-size: 20px;\"><span>2</span> Clique em “Buscar fórmula” e veja sua fórmula</li><li style=\"font-size: 20px;\"><span>3</span> Agora, é só clicar em “Fazer orçamento” e descobrir o melhor negócio!</li></ul> <a href=\"/home\" class=\"btn_1\">Experimente já</a> </div></div>");
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
