// Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = {
        onInput: function(input) {
          return {
              size: input.size || "normal",
              variant: input.variant || "primary",
              body: input.label || input.renderBody,
              className: input["class"]
            };
        },
        handleClick: function(event) {
          this.emit("click", {
              event: event
            });
        }
      },
    marko_components = require("marko/components"),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/layout-footer/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_attr = marko_helpers.a;

function render(input, out, __component, component, state) {
  var data = input;

  out.w("<footer" +
    marko_attr("id", __component.id) +
    "><div class=\"container\"><div class=\"row\"><div class=\"col-md-5 col-sm-4\"><h3>Precisa de ajuda?</h3><a href=\"mailto:ajuda@behealthbrasil.com.br\" id=\"email_footer\">ajuda@behealthbrasil.com.br</a><strong>Pague com</strong><p><img src=\"img/payments.png\" width=\"231\" height=\"30\" alt=\"Image\" data-retina=\"true\" class=\"img-responsive\"></p></div><div class=\"col-md-3 col-sm-4\"><h3>Sobre</h3><ul><li><a href=\"/quemsomos\">Quem somos</a></li><li><a href=\"https://blog.behealthbrasil.com.br\">BLOG</a></li><li><a href=\"/faq\">FAQ</a></li>");

  if (!out.global.currentUser) {
    out.w("<li><a href=\"/login\">Login</a></li><li><a href=\"/register\">Cadastro</a></li>");
  }

  out.w("<li><a href=\"/termos\">Termos e condições</a></li></ul></div><div class=\"col-md-3 col-sm-4\" id=\"newsletter\"><h3>Newsletter</h3><p>Fique por dentro das nossas novidades.</p><div id=\"message-newsletter_2\"></div><form method=\"post\" action=\"assets/newsletter.php\" name=\"newsletter_2\" id=\"newsletter_2\"><div class=\"form-group\"><input name=\"email_newsletter_2\" id=\"email_newsletter_2\" type=\"email\" value=\"\" placeholder=\"Seu email\" class=\"form-control\"></div><input type=\"submit\" value=\"Assinar\" class=\"btn_1\" id=\"submit-newsletter_2\"></form></div></div><div class=\"row\"><div class=\"col-md-12\"><div id=\"social_footer\"><ul><li><a href=\"https://www.facebook.com/behealthbrasil/\" target=\"_blank\"><i class=\"icon-facebook\"></i></a></li><li><a href=\"https://www.instagram.com/behealthbr/\" target=\"_blank\"><i class=\"icon-instagram\"></i></a></li></ul><p>© Behealth 2017</p></div></div></div></div></footer>");
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
    ]
  };
