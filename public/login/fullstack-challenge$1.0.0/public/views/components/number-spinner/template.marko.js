$_mod.def("/fullstack-challenge$1.0.0/public/views/components/number-spinner/template.marko", function(require, exports, module, __filename, __dirname) { function create(__helpers) {
  var __widgetType = {
          name: "/fullstack-challenge$1.0.0/public/views/components/number-spinner/index",
          def: function() {
            return require('/fullstack-challenge$1.0.0/public/views/components/number-spinner/index'/*"./index.js"*/);
          }
        },
      __markoWidgets = require('/marko-widgets$6.6.0/lib/index-browser'/*"marko-widgets"*/),
      __widgetAttrs = __markoWidgets.attrs,
      str = __helpers.s,
      empty = __helpers.e,
      notEmpty = __helpers.ne,
      escapeXml = __helpers.x,
      __loadTag = __helpers.t,
      w_widget_tag = __loadTag(require('/marko-widgets$6.6.0/taglib/widget-tag'/*"marko-widgets/taglib/widget-tag"*/)),
      classAttr = __helpers.ca,
      attr = __helpers.a,
      attrs = __helpers.as,
      escapeXmlAttr = __helpers.xa;

  return function render(data, out) {
    w_widget_tag({
        type: __widgetType,
        _cfg: data.widgetConfig,
        _state: data.widgetState,
        _props: data.widgetProps,
        _body: data.widgetBody,
        renderBody: function renderBody(out, widget) {
          out.w("<div" +
            classAttr(data.className) +
            attr("id", widget.id) +
            attrs(__widgetAttrs(widget)) +
            "><button type=\"button\" data-w-onclick=\"handleDecrementClick|" +
            escapeXmlAttr(widget.id) +
            "\">-</button><input type=\"text\"" +
            attr("value", data.value) +
            " size=\"2\"><button type=\"button\" data-w-onclick=\"handleIncrementClick|" +
            escapeXmlAttr(widget.id) +
            "\">+</button></div>");
        }
      }, out);
  };
}

(module.exports = require('/marko$3.14.2/runtime/marko-runtime'/*"marko"*/).c(__filename)).c(create);

});