// Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = require("./component"),
    marko_widgets = require("marko/widgets"),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/fullstack-challenge$1.0.0/views/components/app-overlay/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_attr = marko_helpers.a,
    marko_loadTag = marko_helpers.t,
    include_tag = marko_loadTag(require("marko/widgets/taglib/include-tag")),
    marko_loadTemplate = require("marko/runtime/helper-loadTemplate"),
    app_button_template = marko_loadTemplate(require.resolve("../app-button")),
    app_button_tag = marko_loadTag(app_button_template),
    marko_styleAttr = marko_helpers.sa,
    marko_classAttr = marko_helpers.ca;

function render(input, out, widget, state) {
  var data = input;

  out.w("<div" +
    marko_classAttr([
      "app-overlay",
      state.visible && "visible"
    ]) +
    marko_attr("id", widget.id) +
    "><div class=\"app-overlay-mask\"" +
    marko_attr("data-_onclick", widget.d("handleMaskClick"), false) +
    "></div><div class=\"app-overlay-container\"" +
    marko_styleAttr({
      width: state.width
    }) +
    ">");

  var __widgetId0 = widget.elId("body");

  out.w("<div class=\"app-overlay-body\"" +
    marko_attr("id", __widgetId0) +
    ">");

  include_tag({
      _target: state.body,
      _elId: __widgetId0
    }, out);

  out.w("</div><div class=\"app-overlay-footer\">");

  app_button_tag({
      label: "Cancel",
      size: "large",
      variant: "secondary",
      $w: [
        widget,
        "1[]",
        [
          "click",
          "handleCancelButtonClick",
          null
        ]
      ]
    }, out);

  out.w(" &nbsp; ");

  app_button_tag({
      label: "Done",
      size: "large",
      variant: "primary",
      $w: [
        widget,
        "2[]",
        [
          "click",
          "handleDoneButtonClick",
          null
        ]
      ]
    }, out);

  out.w("</div></div></div>");
}

marko_template._ = marko_widgets.r(render, {
    type: marko_widgetType
  }, marko_component);

marko_template.Widget = marko_widgets.w(marko_component, marko_template._);

marko_template.meta = {
    deps: [
      "./style.less",
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
      "marko/widgets/taglib/include-tag",
      "../app-button"
    ]
  };
