// Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = ({
    onInput: function () {
        this.state = { stateIndex: null };
    },
    handleSelectChange: function (event, selectEl) {
        if (selectEl.selectedIndex === 0) {
            this.state.stateIndex = null;
        } else {
            this.state.stateIndex = selectEl.selectedIndex - 1;
        }
    }
}),
    marko_widgets = require("marko/widgets"),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/fullstack-challenge$1.0.0/views/components/app-state-select/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_attr = marko_helpers.a,
    marko_forEachProp = require("marko/runtime/helper-forEachProperty"),
    marko_escapeXml = marko_helpers.x,
    marko_classAttr = marko_helpers.ca;

var states = [
    {
        name: 'Colorado',
        value: 'CO'
    },
    {
        name: 'California',
        value: 'CA'
    }
];

function render(input, out, widget, state) {
  var data = input;

  out.w("<div" +
    marko_attr("id", widget.id) +
    "><h3>Choose a state</h3><select" +
    marko_attr("data-_onchange", widget.d("handleSelectChange"), false) +
    "><option value=\"\"" +
    marko_attr("selected", state.stateIndex == null) +
    ">(choose a state)</option>");

  marko_forEachProp(states, function(index, stateInfo) {
    out.w("<option" +
      marko_attr("value", stateInfo.value) +
      marko_attr("selected", state.stateIndex === index) +
      ">" +
      marko_escapeXml(stateInfo.name) +
      "</option>");
  });

  out.w("</select>");

  if (state.stateIndex != null) {
    out.w("<div>You selected: <div" +
      marko_classAttr([
        "state-icon",
        states[state.stateIndex].value
      ]) +
      "></div></div>");
  }

  out.w("</div>");
}

marko_template._ = marko_widgets.r(render, {
    type: marko_widgetType
  }, marko_component);

marko_template.Widget = marko_widgets.w(marko_component, marko_template._);

marko_template.meta = {
    deps: [
      {
          type: "css",
          code: ".state-icon {\n        width: 75px;\n        height: 50px;\n    }\n\n    .state-icon.CA {\n        background-image: url('./CA.png')\n    }\n\n    .state-icon.CO {\n        background-image: url('./CO.png')\n    }",
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
