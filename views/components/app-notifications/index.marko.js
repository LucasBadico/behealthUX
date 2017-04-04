// Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = require("./component"),
    marko_widgets = require("marko/widgets"),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/fullstack-challenge$1.0.0/views/components/app-notifications/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_forEach = marko_helpers.f,
    marko_merge = require("marko/runtime/helper-merge"),
    marko_loadTemplate = require("marko/runtime/helper-loadTemplate"),
    app_notification_template = marko_loadTemplate(require.resolve("../app-notification")),
    marko_loadTag = marko_helpers.t,
    app_notification_tag = marko_loadTag(app_notification_template),
    marko_attr = marko_helpers.a;

function render(input, out, widget, state) {
  var data = input;

  out.w("<div class=\"app-notifications\"" +
    marko_attr("id", widget.id) +
    ">");

  marko_forEach(state.notifications, function(notification) {
    app_notification_tag(marko_merge({
        $w: [
          widget,
          notification.id
        ]
      }, notification), out);
  });

  out.w("</div>");
}

marko_template._ = marko_widgets.r(render, {
    type: marko_widgetType
  }, marko_component);

marko_template.Widget = marko_widgets.w(marko_component, marko_template._);

marko_template.meta = {
    deps: [
      {
          type: "less",
          code: ".app-notifications {\n        position: fixed;\n        top: 0px;\n        width: 500px;\n        left: 50%;\n        margin-left: -250px;\n    }",
          virtualPath: "./index.marko.less",
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
    ],
    tags: [
      "../app-notification"
    ]
  };
