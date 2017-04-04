// Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require("marko/html").t(__filename),
    marko_loadTemplate = require("marko/runtime/helper-loadTemplate"),
    default_template = marko_loadTemplate(require.resolve("../../layouts/default")),
    __browser_json = require.resolve("./browser.json"),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_loadTag = marko_helpers.t,
    lasso_page_tag = marko_loadTag(require("lasso/taglib/config-tag")),
    app_white_popular_template = marko_loadTemplate(require.resolve("../../components/app-white-popular")),
    app_white_popular_tag = marko_loadTag(app_white_popular_template),
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
      title: {
          renderBody: function renderBody(out) {
            out.w("Página não encontrada | Behealth");
          }
        },
      body: {
          renderBody: function renderBody(out) {
            out.w("<section id=\"hero\"><div class=\"intro_title error\"><h1 class=\"animated fadeInDown\">404</h1><p class=\"animated fadeInDown\">Oops!! Página não encontrada</p><a href=\"/home\" class=\"animated fadeInUp button_intro\">Ir para home</a> <a href=\"https://blog.behealthbrasil.com.br\" class=\"animated fadeInUp button_intro outline\">Ir para o blog</a></div></section>");

            app_white_popular_tag({}, out);
          }
        }
    }, out);
}

marko_template._ = render;

marko_template.meta = {
    tags: [
      "../../layouts/default",
      "lasso/taglib/config-tag",
      "../../components/app-white-popular",
      "marko/taglibs/core/include-tag"
    ]
  };
