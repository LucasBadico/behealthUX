// Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = require("./component"),
    marko_widgets = require("marko/widgets"),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/fullstack-challenge$1.0.0/views/components/app-progress-bar/index.marko", function() {
      return module.exports;
    }),
    marko_forEachProp = require("marko/runtime/helper-forEachProperty"),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_loadTag = marko_helpers.t,
    include_tag = marko_loadTag(require("marko/widgets/taglib/include-tag")),
    marko_attr = marko_helpers.a,
    marko_classAttr = marko_helpers.ca;

function render(input, out, widget, state) {
  var data = input;

  out.w("<div class=\"app-progress-bar\"" +
    marko_attr("id", widget.id) +
    ">");

  marko_forEachProp(state.steps, function(stepIndex, step) {
    out.w("<div" +
      marko_classAttr([
        "progress-step",
        (stepIndex === state.activeIndex) && "active"
      ]) +
      marko_attr("data-_onclick", widget.d("handleStepClick", [
        stepIndex
      ]), false) +
      "><a href=\"#\" class=\"progress-step\">");

    var __widgetId1 = widget.elId("0[]");

    out.w("<span" +
      marko_attr("id", __widgetId1) +
      ">");

    include_tag({
        _target: step.renderBody || step.label,
        _elId: __widgetId1
      }, out);

    out.w("</span><div class=\"completion-icon\"></div></a><div class=\"progress-step-end\"><svg class=\"progress-step-end\" viewBox=\"0 0 125 100\" overflow=\"visible\" enable-background=\"new 0 0 100 100\" preserveAspectRatio=\"none\"><polygon points=\"0,0 25,0 125,50 25,100 0,100\" fill=\"white\"></polygon><polygon class=\"progress-step-end\" points=\"0,0 100,50 0,100\"></polygon></svg></div></div>");
  });

  out.w("</div>");
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
      "marko/widgets/taglib/include-tag"
    ]
  };
