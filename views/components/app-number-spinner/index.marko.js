// Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = ({
    getInitialState: function (input) {
        console.log('initialstate');
        return {
            name: input.name,
            selected: input.selected || false
        };
    },
    onInput: function (input) {
        var value = input.value || 0;
        var index = input.index || 0;
        this.state = {
            value: value,
            index: index
        };
        console.log(input.index);
    },
    handleIncrementClick: function (delta) {
        if (this.state.value + delta >= 0) {
            this.state.value += delta;
            var value = this.state.value;
            var data = {
                target: this.state.index,
                value: value
            };
            pubsub.emit('setQtd', data);
        }
    },
    handleInputKeyUp: function (event, el) {
        var newValue = el.value;
        if (/^-?[0-9]+$/.test(newValue)) {
            this.state.value = parseInt(newValue, 10);
            var value = this.state.value;
            var data = {
                target: this.state.index,
                value: value
            };
            pubsub.emit('setQtd', data);
        }
    }
}),
    marko_components = require("marko/components"),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/app-number-spinner/index.marko", function() {
      return module.exports;
    }),
    pubsub = require("raptor-pubsub"),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_attr = marko_helpers.a,
    marko_classAttr = marko_helpers.ca;

require("./style.css");

function getClassNameForValue(value) {
    if (value < 0) {
        return 'negative'
    } else if (value > 0) {
        return 'positive'
    }
};

function render(input, out, __component, component, state) {
  var data = input;

  var value=state.value;

  out.w("<div" +
    marko_classAttr([
      "number-spinner",
      getClassNameForValue(value)
    ]) +
    marko_attr("id", __component.id) +
    "><input type=\"text\"" +
    marko_attr("value", state.value) +
    " size=\"4\"" +
    marko_attr("data-_onkeyup", __component.d("handleInputKeyUp"), false) +
    "></div>");
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

marko_template.meta = {
    deps: [
      "./style.css",
      {
          type: "require",
          path: "./"
        }
    ]
  };
