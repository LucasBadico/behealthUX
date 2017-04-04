// Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = ({
    onCreate: function (input) {
        console.log('create ? li-comp-profile', input);
        this.state = input;
        this.state.count = 0;
        this.state.show = '';
    },
    onInput: function (input) {
        console.log('input', input);
        return {
            user: input.user || 'none',
            size: input.size || 'normal',
            variant: input.variant || 'primary',
            body: input.label || input.renderBody,
            className: input['class']
        };
    },
    doLogin: function () {
        console.log('login!', this.state);
    },
    openPanel: function () {
        this.state.show = 'pop-show';
        this.subscribeTo(window).on('bodyClick', () => {
            console.log('The user scrolled the window!');
        });
    }
}),
    marko_widgets = require("marko/widgets"),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/behealth$0.0.1/views/components/login-pop-up/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_attr = marko_helpers.a,
    marko_classAttr = marko_helpers.ca;

function render(input, out, widget, state) {
  var data = input;

  out.w("<li" +
    marko_attr("id", widget.id) +
    "><div class=\"dropdown\"><a href=\"#\"" +
    marko_attr("data-_onclick", widget.d("openPanel"), false) +
    ">Login</a><div" +
    marko_classAttr([
      "pop-panel",
      state.show
    ]) +
    "><div class=\"form-group\"><input type=\"text\" class=\"form-control\" id=\"inputUsernameEmail\" placeholder=\"Email\"></div><div class=\"form-group\"><input type=\"password\" class=\"form-control\" id=\"inputPassword\" placeholder=\"Password\"></div><a id=\"forgot_pw\" href=\"#\">Esqueceu sua senha?</a><button name=\"Sign in\" value=\"Logar\" id=\"Sign_in\" class=\"button_drop\"" +
    marko_attr("data-_onclick", widget.d("doLogin"), false) +
    "> Logar1</button></div></div></li>");
}

marko_template._ = marko_widgets.r(render, {
    type: marko_widgetType
  }, marko_component);

marko_template.Widget = marko_widgets.w(marko_component, marko_template._);

marko_template.meta = {
    deps: [
      "./style.less",
      {
          type: "css",
          code: ".pop-panel {\n\t\t\tdisplay: none;\n\t    padding: 10px;\n\t    background-color: white;\n\t    border-top: 2px solid red;\n\t\t\tposition: fixed;\n\t\t\tmargin-top:10px;\n    }\n\n\t\t.pop-show {\n\t\t\tdisplay: block;\n\n\t\t}",
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
