// Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = {
        onCreate: function(input) {},
        onInput: function(input) {
          return {
              size: input.size || "normal",
              variant: input.variant || "primary",
              body: input.label || input.renderBody,
              className: input["class"]
            };
        },
        handleClick: function(event) {
          console.log("click!");

          this.emit("click", {
              event: event
            });
        }
      },
    marko_components = require("marko/components"),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/comp-menu/index.marko", function() {
      return module.exports;
    }),
    marko_loadTemplate = require("marko/runtime/helper-loadTemplate"),
    div_cart_template = marko_loadTemplate(require.resolve("../div-cart")),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_loadTag = marko_helpers.t,
    div_cart_tag = marko_loadTag(div_cart_template),
    marko_attr = marko_helpers.a;

function isActive(link,actual) {
	//console.log(link,actual);

		if(link == actual){
			return 'active';
		}

		return 'not-active';
	};

function render(input, out, __component, component, state) {
  var data = input;

  var variantClassName = (input.variant !== 'primary' && 'app-button-' + input.variant);

  var sizeClassName = (input.size !== 'normal' && 'app-button-' + input.size);

  out.w("<nav class=\"col-md-7 col-sm-9 col-xs-9\"" +
    marko_attr("id", __component.id) +
    "><a class=\"cmn-toggle-switch cmn-toggle-switch__htx open_close\" href=\"javascript:void(0);\"><span>Menu mobile</span></a><div class=\"main-menu\"><div id=\"header_menu\"><a href=\"/home\" style=\"text-decoration:none;\"><img src=\"img/logo_sticky.png\" width=\"160\" height=\"34\" alt=\"City tours\" data-retina=\"true\"></a></div><a href=\"#\" class=\"open_close\" id=\"close_in\"><i class=\"icon_set_1_icon-77\"></i></a><ul></ul></div><ul id=\"top_tools\"><li><div class=\"dropdown dropdown-search\"><a href=\"#\" class=\"dropdown-toggle\" data-toggle=\"dropdown\"><i class=\"icon-search\"></i></a><div class=\"dropdown-menu\"><form><div class=\"input-group\"><input type=\"text\" class=\"form-control\" placeholder=\"Search...\"><span class=\"input-group-btn\"><button class=\"btn btn-default\" type=\"button\" style=\"margin-left:0;\"><i class=\"icon-search\"></i></button></span></div></form></div></div></li><li>");

  div_cart_tag({
      mode: "dropdown"
    }, out);

  out.w("</li></ul></nav>");
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

marko_template.meta = {
    deps: [
      "./style.less",
      {
          type: "require",
          path: "./"
        }
    ],
    tags: [
      "../div-cart"
    ]
  };
