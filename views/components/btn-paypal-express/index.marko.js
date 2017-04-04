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
        sendPayment: function(event) {
          pubsub.emit("onSendPayment", {});

          this.emit("click", {
              event: event
            });
        }
      },
    marko_components = require("marko/components"),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/btn-paypal-express/index.marko", function() {
      return module.exports;
    }),
    pubsub = require("raptor-pubsub"),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_attr = marko_helpers.a;

function render(input, out, __component, component, state) {
  var data = input;

  out.w("<span" +
    marko_attr("id", __component.id) +
    ">pague com <button style=\"background-color: #ffcc00;&#10;width:100%;height:50px;text-align:center;margin-bottom:15px;\"" +
    marko_attr("data-_onclick", __component.d("sendPayment"), false) +
    "><img src=\"/img/button-paypal.png\" class=\"img-responsive\" style=\"display:-webkit-inline-box;height:50px;\"></button></span>");
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
          code: ".paypal{\n    background-color: #ffcc00;\n    width:100%;\n    height:50px;\n    text-align:center;\n    margin-bottom:15px;\n\n  }",
          virtualPath: "./index.marko.css",
          path: "./index.marko"
        },
      {
          type: "require",
          path: "./"
        }
    ]
  };
