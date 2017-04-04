// Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_loadTemplate = require("marko/runtime/helper-loadTemplate"),
    default_template = marko_loadTemplate(require.resolve("../../layouts/default")),
    __browser_json = require.resolve("./browser.json"),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_loadTag = marko_helpers.t,
    lasso_page_tag = marko_loadTag(require("lasso/taglib/config-tag")),
    section_steps_template = marko_loadTemplate(require.resolve("../../components/section-steps")),
    section_steps_tag = marko_loadTag(section_steps_template),
    div_cart_template = marko_loadTemplate(require.resolve("../../components/div-cart")),
    div_cart_tag = marko_loadTag(div_cart_template),
    div_box_summary_template = marko_loadTemplate(require.resolve("../../components/div-box-summary")),
    div_box_summary_tag = marko_loadTag(div_box_summary_template),
    div_box_help_template = marko_loadTemplate(require.resolve("../../components/div-box-help")),
    div_box_help_tag = marko_loadTag(div_box_help_template),
    include_tag = marko_loadTag(require("marko/taglibs/core/include-tag"));

function render(input, out) {
  var data = input;

  lasso_page_tag({
      packagePath: __browser_json,
      dirname: __dirname,
      filename: __filename
    }, out);

  include_tag({
      _target: default_template,
      url: data.url,
      title: {
          renderBody: function renderBody(out) {
            out.w("Be Health - Compare e compre manipulados no único comparador de preços do Brasil. Seguro. Rápido. Prático e sempre pelo menor preço!");
          }
        },
      body: {
          renderBody: function renderBody(out) {
            section_steps_tag({
                text: "Confira os itens do seu carrinho",
                id: "122313321",
                step: 1,
                type: "waiting"
              }, out);

            out.w("<div class=\"container margin_60\"><div class=\"row\"><div class=\"col-md-8\">");

            div_cart_tag({
                mode: "page"
              }, out);

            out.w("</div><aside class=\"col-md-4\">");

            div_box_summary_tag({
                buyButton: "true",
                user: out.global.currentUser
              }, out);

            div_box_help_tag({}, out);

            out.w("</aside></div></div>");
          }
        }
    }, out);
}

marko_template._ = render;

marko_template.meta = {
    tags: [
      "../../layouts/default",
      "lasso/taglib/config-tag",
      "../../components/section-steps",
      "../../components/div-cart",
      "../../components/div-box-summary",
      "../../components/div-box-help",
      "marko/taglibs/core/include-tag"
    ]
  };
