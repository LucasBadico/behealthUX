// Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
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
    marko_widgets = require("marko/widgets"),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/behealth$0.0.1/views/components/div-input-cupon/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_classAttr = marko_helpers.ca,
    marko_attr = marko_helpers.a;

function render(input, out, widget, state) {
  var data = input;

  var variantClassName = (input.variant !== 'primary' && 'app-button-' + input.variant);

  var sizeClassName = (input.size !== 'normal' && 'app-button-' + input.size);

  out.w("<div" +
    marko_classAttr([
      input.className,
      "white-box"
    ]) +
    marko_attr("id", widget.id) +
    "><h4>Cupon de desconto</h4><div class=\"form-group col-xs-8\"><label>Código do cupon de desconto</label><input class=\"form-control\" name=\"cupon\" id=\"cupon\" type=\"text\"></div><button type=\"submit\" class=\"btn_1 green cep-button\">Aplicar cupon</button></div>");
}

marko_template._ = marko_widgets.r(render, {
    type: marko_widgetType
  }, marko_component);

marko_template.Widget = marko_widgets.w(marko_component, marko_template._);

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
          path: "./index.marko"
        },
      {
          type: "require",
          path: "marko/widgets"
        }
    ]
  };
