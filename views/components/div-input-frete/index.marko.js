// Compiled using marko@4.1.0 - DO NOT EDIT
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
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/div-input-frete/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_classAttr = marko_helpers.ca,
    marko_attr = marko_helpers.a;

function render(input, out, __component, component, state) {
  var data = input;

  var variantClassName = (input.variant !== 'primary' && 'app-button-' + input.variant);

  var sizeClassName = (input.size !== 'normal' && 'app-button-' + input.size);

  out.w("<div" +
    marko_classAttr([
      input.className,
      "white-box"
    ]) +
    marko_attr("id", __component.id) +
    "><h4>Calcular Frete</h4><div class=\"form-group col-xs-8\"><label>CEP</label><input class=\"form-control\" name=\"cep\" id=\"old_password\" type=\"text\"></div><button type=\"submit\" class=\"btn_1 green cep-button\">Calcular Frete</button></div>");
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
          code: ".white-box {\n    padding: 20px;\n    margin-bottom: 28px;\n    padding-bottom: 35px;\n    border-radius: 2px;\n    border: 1px solid rgba(0,0,0,0.1);\n    background-color: white;\n  }\n\n\n  .cep-button {\n    bottom: 0;\n    margin-top: 25px;\n    height: 38px;\n  }",
          virtualPath: "./index.marko.css",
          path: "./index.marko"
        },
      {
          type: "require",
          path: "./"
        }
    ]
  };
