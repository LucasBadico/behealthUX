// Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = ({
    onInput: function (input) {
        var activeIndex = 0;
        var tabs = input.tabs;
        if (tabs) {
            tabs.forEach(function (tab, i) {
                if (tab.active) {
                    activeIndex = i;
                }
            });
        }
        this.state = { activeIndex: activeIndex };
    },
    setActiveIndex: function (newActiveIndex) {
        this.state.activeIndex = newActiveIndex;
    },
    handleTabClick: function (tabIndex, event) {
        this.setActiveIndex(tabIndex);
        event.preventDefault();
    }
}),
    marko_widgets = require("marko/widgets"),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/fullstack-challenge$1.0.0/views/components/app-tabs/index.marko", function() {
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

  out.w("<div class=\"app-tabs\"" +
    marko_attr("id", widget.id) +
    "><ul class=\"tab-nav\">");

  marko_forEachProp(input.tabs, function(tabIndex, tab) {
    out.w("<li" +
      marko_classAttr([
        "tab",
        (tabIndex === state.activeIndex) && "active"
      ]) +
      ">");

    var __widgetId1 = widget.elId("0[]");

    out.w("<a href=\"#\"" +
      marko_attr("data-_onclick", widget.d("handleTabClick", [
        tabIndex
      ]), false) +
      marko_attr("id", __widgetId1) +
      ">");

    include_tag({
        _target: tab.label,
        _elId: __widgetId1
      }, out);

    out.w("</a></li>");
  });

  out.w("</ul><div style=\"clear: both\"></div><div class=\"tab-panes\">");

  marko_forEachProp(input.tabs, function(tabIndex, tab) {
    var __widgetId3 = widget.elId("2[]");

    out.w("<div" +
      marko_classAttr([
        "tab-pane",
        (tabIndex === state.activeIndex) && "active"
      ]) +
      marko_attr("id", __widgetId3) +
      ">");

    include_tag({
        _target: tab.renderBody,
        _elId: __widgetId3
      }, out);

    out.w("</div>");
  });

  out.w("</div></div>");
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
