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
                text: "aguardando confirmação pagamento",
                "*": {
                    "\\": true
                  },
                id: "122313321",
                step: 2,
                type: "waiting"
              }, out);

            out.w("<div class=\"container margin_60\"><div class=\"row\"><div class=\"col-md-8 add_bottom_15\"><div class=\"form_title\"><h3><strong><i class=\"icon-ok\"></i></strong>Thank you!</h3><p>Mussum ipsum cacilds, vidis litro abertis.</p></div><div class=\"step\"><p>Lorem ipsum dolor sit amet, nostrud nominati vis ex, essent conceptam eam ad. Cu etiam comprehensam nec. Cibo delicata mei an, eum porro legere no. Te usu decore omnium, quem brute vis at, ius esse officiis legendos cu. Dicunt voluptatum at cum. Vel et facete equidem deterruisset, mei graeco cetero labores et. Accusamus inciderint eu mea.</p></div><div class=\"form_title\"><h3><strong><i class=\"icon-tag-1\"></i></strong>Booking summary</h3><p>Mussum ipsum cacilds, vidis litro abertis.</p></div><div class=\"step\"><table class=\"table confirm\"><thead><tr><th colspan=\"2\">Item 1</th></tr></thead><tbody><tr><td><strong>Louvre musuem tickets</strong></td><td>2x</td></tr><tr><td><strong>Date</strong></td><td>25 Febraury 2015</td></tr><tr><td><strong>To</strong></td><td>Jhon Doe</td></tr><tr><td><strong>Payment type</strong></td><td>Credit card</td></tr></tbody></table><table class=\"table confirm\"><thead><tr><th colspan=\"2\">Item 2</th></tr></thead><tbody><tr><td><strong>Senna river tour</strong></td><td>2x</td></tr><tr><td><strong>Date</strong></td><td>27 Febraury 2015</td></tr><tr><td><strong>To</strong></td><td>Jhon Doe</td></tr><tr><td><strong>Payment type</strong></td><td>Credit card</td></tr></tbody></table></div></div><aside class=\"col-md-4\"><div class=\"box_style_1\"><h3 class=\"inner\">Thank you!</h3><p>Nihil inimicus ex nam, in ipsum dignissim duo. Tale principes interpretaris vim ei, has posidonium definitiones ut. Duis harum fuisset ut his, duo an dolor epicuri appareat.</p><hr><a class=\"btn_full_outline\" href=\"/history?numeropedido\" target=\"_blank\">Registro do seu pedido</a></div>");

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
      "../../components/div-box-help",
      "marko/taglibs/core/include-tag"
    ]
  };
