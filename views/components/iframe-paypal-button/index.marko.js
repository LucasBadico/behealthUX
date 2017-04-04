// Compiled using marko@4.1.0 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = {
        onCreate: function(input) {
          this.state = {
              total: 10
            };
        },
        onInput: function(input) {
          return {
              size: input.size || "normal",
              variant: input.variant || "primary",
              body: input.label || input.renderBody,
              className: input["class"]
            };
        },
        onMount: function() {
          var self = this;

          paypal.Button.render({
              env: "sandbox",
              locale: "pt_BR",
              style: {
                  size: "medium",
                  color: "gold",
                  shape: "rect"
                },
              client: {
                  sandbox: "AYJxKHVYEaAC7aQ4dpsCcPb0QvwqfXJoSkLc5k10OCKnuP0Dbdmbd8bHfVP09o-x8mM0FJGmduPzTHCt",
                  production: "xxxxxxxxx"
                },
              payment: function() {
                var env = this.props.env;

                var client = this.props.client;

                return paypal.rest.payment.create(env, client, {
                    transactions: [
                        {
                            amount: {
                                total: self.state.total,
                                currency: "USD"
                              }
                          }
                      ]
                  });
              },
              commit: true,
              onAuthorize: function(data, actions) {
                return actions.payment.execute().then(function() {
                  window.location.assign("/confirmation");
                });
              }
            }, "#paypal-button");
        },
        handleClick: function(event) {
          this.emit("click", {
              event: event
            });
        }
      },
    marko_components = require("marko/components"),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/iframe-paypal-button/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_attr = marko_helpers.a;

function render(input, out, __component, component, state) {
  var data = input;

  var variantClassName = (input.variant !== 'primary' && 'app-button-' + input.variant);

  var sizeClassName = (input.size !== 'normal' && 'app-button-' + input.size);

  out.w("<div class=\"paypal-frame\"" +
    marko_attr("id", __component.id) +
    "><div class=\"btn_full_outline\" href=\"#\" id=\"paypal-button\"></div></div>");
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
          code: ".paypal-frame {\n    position: relative;\n    height: 62px;\n    width: 230px;\n    margin: auto 50%;\n    transform: translateX(-50%);\n  }",
          virtualPath: "./index.marko.css",
          path: "./index.marko"
        },
      {
          type: "require",
          path: "./"
        }
    ]
  };
