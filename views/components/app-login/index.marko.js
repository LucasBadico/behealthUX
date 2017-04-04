// Compiled using marko@4.1.0 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_loadTemplate = require("marko/runtime/helper-loadTemplate"),
    div_col_login_template = marko_loadTemplate(require.resolve("../div-col-login")),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_loadTag = marko_helpers.t,
    div_col_login_tag = marko_loadTag(div_col_login_template);

function render(input, out) {
  var data = input;

  out.w("<section id=\"hero\" class=\"login\"><div class=\"container\"><div class=\"row\">");

  div_col_login_tag({
      "class": "col-md-4 col-md-offset-4 col-sm-6 col-sm-offset-3"
    }, out);

  out.w("</div></div></section>");
}

marko_template._ = render;

marko_template.meta = {
    deps: [
      "./style.less"
    ],
    tags: [
      "../div-col-login"
    ]
  };
