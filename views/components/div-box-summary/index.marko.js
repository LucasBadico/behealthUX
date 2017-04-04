// Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = {
        onCreate: function(input) {},
        onInput: function(input) {
          return {
              size: input.size || "normal",
              variant: input.variant || "primary",
              body: input.label || input.renderBody,
              className: input["class"],
              buyButton: input.buyButton || 0
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
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/div-box-summary/index.marko", function() {
      return module.exports;
    }),
    marko_loadTemplate = require("marko/runtime/helper-loadTemplate"),
    div_cart_template = marko_loadTemplate(require.resolve("../div-cart")),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_loadTag = marko_helpers.t,
    div_cart_tag = marko_loadTag(div_cart_template),
    btn_paypal_express_template = marko_loadTemplate(require.resolve("../btn-paypal-express")),
    btn_paypal_express_tag = marko_loadTag(btn_paypal_express_template),
    btn_a_keep_buying_template = marko_loadTemplate(require.resolve("../btn-a-keep-buying")),
    btn_a_keep_buying_tag = marko_loadTag(btn_a_keep_buying_template),
    marko_attr = marko_helpers.a;

function render(input, out, __component, component, state) {
  var data = input;

  out.w("<div class=\"box_style_1\"" +
    marko_attr("id", __component.id) +
    "><h3 class=\"inner\">- Resumo -</h3>");

  div_cart_tag({
      mode: "summary"
    }, out);

  if (input.buyButton) {
    btn_paypal_express_tag({
        order: input.order,
        total: input.total
      }, out);
  }

  btn_a_keep_buying_tag({}, out);

  out.w("<script>\n\n\n</script></div>");
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
      "../div-cart",
      "../btn-paypal-express",
      "../btn-a-keep-buying"
    ]
  };
