// Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_loadTag = marko_helpers.t,
    include_tag = marko_loadTag(require("marko/taglibs/core/include-tag")),
    lasso_head_tag = marko_loadTag(require("lasso/taglib/head-tag")),
    marko_loadTemplate = require("marko/runtime/helper-loadTemplate"),
    div_backdrop_modal_template = marko_loadTemplate(require.resolve("../../components/div-backdrop-modal")),
    div_backdrop_modal_tag = marko_loadTag(div_backdrop_modal_template),
    layout_header_template = marko_loadTemplate(require.resolve("../../components/layout-header")),
    layout_header_tag = marko_loadTag(layout_header_template),
    layout_footer_template = marko_loadTemplate(require.resolve("../../components/layout-footer")),
    layout_footer_tag = marko_loadTag(layout_footer_template),
    lasso_body_tag = marko_loadTag(require("lasso/taglib/body-tag")),
    browser_refresh_tag = marko_loadTag(require("browser-refresh-taglib/refresh-tag")),
    await_reorderer_tag = marko_loadTag(require("marko/taglibs/async/await-reorderer-tag")),
    init_components_tag = marko_loadTag(require("marko/components/taglib/init-components-tag"));

function render(input, out) {
  var data = input;

  out.w("<!doctype html><html lang=\"en\"><head><meta charset=\"UTF-8\"><title>");

  include_tag({
      _target: data.title
    }, out);

  out.w("</title><meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><meta name=\"keywords\" content=\"saúde, bem estar, qualidade de vida\"><meta name=\"description\" content=\"Behealth - Compare e compre nas melhores farmácias de manipulação do Brasil.\"><meta name=\"author\" content=\"Behealth\"><title>Behealth - Compare e compre nas melhores farmácias de manipulação do Brasil.</title><link rel=\"shortcut icon\" href=\"img/favicon.ico?v=5\" type=\"image/x-icon\"><link rel=\"apple-touch-icon\" type=\"image/x-icon\" href=\"img/apple-touch-icon-57x57-precomposed.png\"><link rel=\"apple-touch-icon\" type=\"image/x-icon\" sizes=\"72x72\" href=\"img/apple-touch-icon-72x72-precomposed.png\"><link rel=\"apple-touch-icon\" type=\"image/x-icon\" sizes=\"114x114\" href=\"img/apple-touch-icon-114x114-precomposed.png\"><link rel=\"apple-touch-icon\" type=\"image/x-icon\" sizes=\"144x144\" href=\"img/apple-touch-icon-144x144-precomposed.png\"><link href=\"css/base.css\" rel=\"stylesheet\"><link href=\"css/flickity.css\" rel=\"stylesheet\"><link href=\"https://fonts.googleapis.com/css?family=Montserrat:400,700\" rel=\"stylesheet\" type=\"text/css\"><link href=\"https://fonts.googleapis.com/css?family=Gochi+Hand\" rel=\"stylesheet\" type=\"text/css\"><link href=\"https://fonts.googleapis.com/css?family=Lato:300,400\" rel=\"stylesheet\" type=\"text/css\"><!--[if lt IE 9]>\n      <script src=\"js/html5shiv.min.js\"></script>\n      <script src=\"js/respond.min.js\"></script>\n    <![endif]-->");

  lasso_head_tag({}, out);

  out.w("</head><body>");

  if (out.global.currentUser) {
    div_backdrop_modal_tag({
        email: out.global.currentUser.email
      }, out);
  } else {
    div_backdrop_modal_tag({}, out);
  }

  out.w("<!--[if lte IE 8]>\n    <p class=\"chromeframe\">You are using an <strong>outdated</strong> browser. Please <a href=\"http://browsehappy.com/\">upgrade your browser</a>.</p>\n<![endif]--><div class=\"layer\"></div>");

  include_tag({
      _target: data.url
    }, out);

  layout_header_tag({}, out);

  include_tag({
      _target: data.body
    }, out);

  layout_footer_tag({}, out);

  out.w("<div id=\"toTop\"></div><script src=\"js/jquery-1.11.2.min.js\"></script><script src=\"js/common_scripts_min.js\"></script><script src=\"js/functions.js\"></script>");

  lasso_body_tag({}, out);

  browser_refresh_tag({
      enabled: true
    }, out);

  await_reorderer_tag({}, out);

  init_components_tag({}, out);

  out.w("</body></html>");
}

marko_template._ = render;

marko_template.meta = {
    deps: [
      "./style.less"
    ],
    tags: [
      "marko/taglibs/core/include-tag",
      "lasso/taglib/head-tag",
      "../../components/div-backdrop-modal",
      "../../components/layout-header",
      "../../components/layout-footer",
      "lasso/taglib/body-tag",
      "browser-refresh-taglib/refresh-tag",
      "marko/taglibs/async/await-reorderer-tag",
      "marko/components/taglib/init-components-tag"
    ]
  };
