// Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = ({
    onCreate: function (input) {
        this.state = {
            visible: false,
            classe: 'placeholder',
            type: '',
            thisid: ''
        };
    },
    onInput: function (input) {
        return {
            size: input.size || 'normal',
            variant: input.variant || 'primary',
            body: input.label || input.renderBody,
            className: input['class'],
            email: input.email || ''
        };
    },
    onMount: function () {
        var self = this;
        pubsub.on('showModal', function (data) {
            console.log('show modal', data);
            self.state.classe = 'show-modal';
            self.state.type = data.type;
            self.state.thisid = data.thisid;
        });
        pubsub.on('hideModal', function () {
            console.log('hide modal', self);
            self.state.classe = 'hide-modal';
        });
    },
    close: function () {
        pubsub.emit('hideModal', {});
    },
    show: function (boo) {
        if (boo) {
            return 'show-modal';
        }
        return 'hide-modal';
    }
}),
    marko_components = require("marko/components"),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/div-backdrop-modal/index.marko", function() {
      return module.exports;
    }),
    pubsub = require("raptor-pubsub"),
    marko_loadTemplate = require("marko/runtime/helper-loadTemplate"),
    div_col_login_template = marko_loadTemplate(require.resolve("../div-col-login")),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_loadTag = marko_helpers.t,
    div_col_login_tag = marko_loadTag(div_col_login_template),
    div_col_preorder_template = marko_loadTemplate(require.resolve("../div-col-preorder")),
    div_col_preorder_tag = marko_loadTag(div_col_preorder_template),
    marko_classAttr = marko_helpers.ca,
    marko_attr = marko_helpers.a;

function render(input, out, __component, component, state) {
  var data = input;

  out.w("<div" +
    marko_classAttr([
      "backdrop",
      state.classe
    ]) +
    marko_attr("id", __component.id) +
    ">");

  console.log('user in modal -> ',out.global.currentUser)

  if (!state.type) {
    div_col_login_tag({
        "class": "col-md-4 col-md-offset-4 col-sm-6 col-sm-offset-3",
        mode: "modal"
      }, out);
  }

  if (state.type == "preorder") {
    div_col_preorder_tag({
        "class": "col-md-4 col-md-offset-4 col-sm-6 col-sm-offset-3",
        mode: "modal",
        thisid: state.thisid,
        email: input.email
      }, out);
  }

  out.w("</div>");
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

marko_template.meta = {
    deps: [
      "./style.less",
      {
          type: "css",
          code: ".backdrop{\n    width: 100%;\n    height: 100%;\n    position: fixed;\n    z-index: 9000000;\n    background-color: rgba(0, 0, 0, 0.58);\n    display:none;\n  }\n\n  .show-modal{\n    display:block;\n  }\n\n  .close-modal{\n\n  }",
          virtualPath: "./index.marko.css",
          path: "./index.marko"
        },
      {
          type: "require",
          path: "./"
        }
    ],
    tags: [
      "../div-col-login",
      "../div-col-preorder"
    ]
  };
