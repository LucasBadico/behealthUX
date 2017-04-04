// Compiled using marko@4.1.0 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = {
        onCreate: function(input) {
          this.state = {
              image: "",
              show: false
            };
        },
        onUpdate: function(input) {},
        sendPhoto: function(evt) {
          var self = this;

          var files = evt.target.files;

          var formData = new FormData();

          formData.append("file", files[0]);

          console.log(formData);

          $.ajax({
              url: "https://behealthbrasil.com.br/api/receipe",
              type: "POST",
              data: formData,
              processData: false,
              contentType: false,
              success: function(data) {
                console.info("files", data);

                self.state.image = true;

                var imageUrl = (("data:" + data.type) + ";base64,") + Buffer.from(data.file).toString("base64");

                self.state.image = imageUrl;

                self.state.show = true;

                pubsub.emit("uploadReceipe", data.id);
              }
            });
        }
      },
    marko_components = require("marko/components"),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/div-row-receipe-upload/index.marko", function() {
      return module.exports;
    }),
    pubsub = require("raptor-pubsub"),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_attr = marko_helpers.a,
    marko_classAttr = marko_helpers.ca;

function render(input, out, __component, component, state) {
  var data = input;

  out.w("<div" +
    marko_classAttr([
      "row"
    ]) +
    marko_attr("id", __component.id) +
    "><div class=\"col-md-6\"><div class=\"form-group\"><label>Tire uma foto</label><input type=\"file\" name=\"file-6\" class=\"form-control\" style=\"padding-left: 17px; padding-top: 10px; position: relative; z-index:100;background-color: transparent;\"" +
    marko_attr("data-_onchange", __component.d("sendPhoto"), false) +
    "><label for=\"file-6\" style=\"position: absolute; top: 36px;\"><span style=\"width:165px\"></span><strong style=\"    background-color: #15aa7b; width: 170px; text-align: center; padding: 10px; color: white; border-radius: 3px; margin-left: 3px;\"><i class=\"icon-camera-7\"></i> Tire uma foto&hellip;</strong></label></div></div><div class=\"col-md-6\"><div class=\"form-group\"><label>Faça upload</label><input class=\"form-control\" id=\"receipeUp\" name=\"file-7\" type=\"file\" style=\" padding-left: 60px; padding-top: 11px; position: relative; z-index:100;background-color: transparent;\"" +
    marko_attr("data-_onchange", __component.d("sendPhoto"), false) +
    "><label for=\"file-7\" style=\" padding: 0px; line-height: 35px; margin-top: 2px; position: absolute; top: 26px;\"><span style=\"width:165px\"></span><strong style=\"fill:white;background-color: #15aa7b; padding: 10px; padding-right: 15px; margin-left: 3px; border-radius: 2px;color: white;\">Escolha um arquivo&hellip;</strong></label></div></div></div>");
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
          code: ".image-false{\n    display:none;\n  }\n  .input{\n    display:none;\n  }\n  .input-false{\n    display:block;\n  }",
          virtualPath: "./index.marko.css",
          path: "./index.marko"
        },
      {
          type: "require",
          path: "./"
        }
    ]
  };
