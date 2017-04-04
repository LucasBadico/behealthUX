// Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = {
        onCreate: function() {
          this.state = {
              count: 0
            };
        },
        increment: function() {
          console.log(this.state);

          this.state.count++;
        }
      },
    marko_widgets = require("marko/widgets"),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/behealth$0.0.1/views/components/comp-click-counter/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_escapeXml = marko_helpers.x,
    marko_attr = marko_helpers.a;

function render(input, out, widget, state) {
  var data = input;

  out.w("<div class=\"count\"" +
    marko_attr("id", widget.elId("_r0")) +
    ">" +
    marko_escapeXml(state.count) +
    "</div><button class=\"example-button\"" +
    marko_attr("id", widget.elId("_r1")) +
    marko_attr("data-_onclick", widget.d("increment"), false) +
    ">Click me!</button>");
}

marko_template._ = marko_widgets.r(render, {
    type: marko_widgetType,
    roots: [
      "_r0",
      "_r1"
    ]
  }, marko_component);

marko_template.Widget = marko_widgets.w(marko_component, marko_template._);

marko_template.meta = {
    deps: [
      {
          type: "css",
          code: ".count {\n        color:#09c;\n        font-size:3em;\n    }\n    .example-button {\n        font-size:1em;\n        padding:0.5em;\n    }",
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
