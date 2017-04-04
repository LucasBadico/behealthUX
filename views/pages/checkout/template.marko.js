// Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_loadTemplate = require("marko/runtime/helper-loadTemplate"),
    default_template = marko_loadTemplate(require.resolve("../../layouts/default")),
    __browser_json = require.resolve("./browser.json"),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_loadTag = marko_helpers.t,
    lasso_page_tag = marko_loadTag(require("lasso/taglib/config-tag")),
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
            out.w("<section id=\"hero_2\"><div class=\"intro_title animated fadeInDown\"><h1>Place your order</h1><div class=\"bs-wizard\"><div class=\"col-xs-4 bs-wizard-step complete\"><div class=\"text-center bs-wizard-stepnum\">Your cart</div><div class=\"progress\"><div class=\"progress-bar\"></div></div><a href=\"/cart\" class=\"bs-wizard-dot\"></a></div><div class=\"col-xs-4 bs-wizard-step active\"><div class=\"text-center bs-wizard-stepnum\">Your details</div><div class=\"progress\"><div class=\"progress-bar\"></div></div><a href=\"#\" class=\"bs-wizard-dot\"></a></div><div class=\"col-xs-4 bs-wizard-step disabled\"><div class=\"text-center bs-wizard-stepnum\">Finish!</div><div class=\"progress\"><div class=\"progress-bar\"></div></div><a href=\"/confirmation\" class=\"bs-wizard-dot\"></a></div></div> </div> </section><script src=\"https://www.paypalobjects.com/webstatic/ppplusdcc/ppplusdcc.min.js\" type=\"text/javascript\"></script><div class=\"container margin_60\"><script type=\"application/javascript\">\n  var ppp = PAYPAL.apps.PPP({\n    \"payerEmail\":\"custumer-US@behealthbrasil.com.br\",\n    \"payerPhone\":\"4087962624\",\n    \"payerLastName\":\"US\",\n    \"payerFirstName\":\"Custumer\",\n    \"approvalUrl\": \"https://www.sandbox.paypal.com/cgi-bin/webscr?cmd=_express-checkout&token=EC-99362884U6709714R\",\n    \"placeholder\": \"ppplus\",\n    \"payerTaxId\":\"35054539867\",\n    \"language\": \"pt_BR\",\n    \"mode\": \"sandbox\"});\n</script><div style=\"position:relative;\"><div id=\"ppplus\"> </div></div><button type=\"submit\" id=\"continueButton\" onclick=\"ppp.doContinue(); return false;\"> Checkout</button><div class=\"row\"><aside class=\"col-md-4\">");

            div_box_summary_tag({}, out);

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
      "../../components/div-box-summary",
      "../../components/div-box-help",
      "marko/taglibs/core/include-tag"
    ]
  };
