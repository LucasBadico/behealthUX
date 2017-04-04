// Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require("marko/html").t(__filename),
    __widgetType = {
        name: "/fullstack-challenge$1.0.0/views/components/number-spinner/index",
        def: function() {
          return require("./index.js");
        }
      },
    __markoWidgets = require("marko-widgets"),
    __widgetAttrs = __markoWidgets.attrs,
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_escapeXmlAttr = marko_helpers.xa,
    marko_attr = marko_helpers.a,
    marko_classAttr = marko_helpers.ca,
    marko_attrs = marko_helpers.as,
    marko_loadTag = marko_helpers.t,
    w_widget_tag = marko_loadTag(require("marko-widgets/taglib/widget-tag"));

function render(input, out) {
  var data = input;

  w_widget_tag({
      type: __widgetType,
      _cfg: data.widgetConfig,
      _state: data.widgetState,
      _props: data.widgetProps,
      _body: data.widgetBody,
      renderBody: function renderBody(out, widget) {
        out.w("<div" +
          marko_classAttr(data.className) +
          marko_attr("id", widget.id) +
          marko_attrs(__widgetAttrs(widget)) +
          "><button type=\"button\" data-w-onclick=\"handleDecrementClick|" +
          marko_escapeXmlAttr(widget.id) +
          "\">-</button><input type=\"text\"" +
          marko_attr("value", data.value) +
          " size=\"2\"><button type=\"button\" data-w-onclick=\"handleIncrementClick|" +
          marko_escapeXmlAttr(widget.id) +
          "\">+</button></div>");
      }
    }, out);
}

marko_template._ = render;

marko_template.meta = {
    tags: [
      "marko-widgets/taglib/widget-tag"
    ]
  };
