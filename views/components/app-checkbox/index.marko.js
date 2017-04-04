// Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = ({
    onInput: function (input) {
        this.state = { checked: input.checked === true };
    },
    isChecked: function () {
        return this.state.checked === true;
    },
    setChecked: function (newChecked) {
        this.state.checked = newChecked;
    },
    toggle: function () {
        this.state.checked = !this.state.checked;
    },
    getData: function () {
        return this.input.data;
    },
    handleClick: function () {
        var newChecked = !this.state.checked;
        var defaultPrevented = false;
        this.emit('toggle', {
            checked: newChecked,
            data: this.getData(),
            preventDefault: function () {
                defaultPrevented = true;
            }
        });
        if (!defaultPrevented) {
            this.state.checked = newChecked;
        }
    }
}),
    marko_widgets = require("marko/widgets"),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/fullstack-challenge$1.0.0/views/components/app-checkbox/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_loadTag = marko_helpers.t,
    include_tag = marko_loadTag(require("marko/widgets/taglib/include-tag")),
    marko_attr = marko_helpers.a,
    marko_loadTemplate = require("marko/runtime/helper-loadTemplate"),
    app_button_template = marko_loadTemplate(require.resolve("../app-button")),
    app_button_tag = marko_loadTag(app_button_template);

function render(input, out, widget, state) {
  var data = input;

  var classNames=[
      'app-checkbox',
      input['class'],
      state.checked && 'checked'
  ];

  app_button_tag({
      "class": classNames,
      $w: [
        widget,
        "button",
        [
          "click",
          "handleClick",
          null
        ]
      ],
      renderBody: function renderBody(out) {
        out.w("<span class=\"app-checkbox-icon\"></span>");

        var __widgetId0 = widget.elId("checkboxLabel");

        out.w("<span" +
          marko_attr("id", __widgetId0) +
          ">");

        include_tag({
            _target: input.label || input.renderBody,
            _elId: __widgetId0
          }, out);

        out.w("</span>");
      }
    }, out);
}

marko_template._ = marko_widgets.r(render, {
    type: marko_widgetType,
    roots: [
      "button"
    ]
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
