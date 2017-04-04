// Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = ({
    onCreate: function (input) {
        this.state = {
            listSubstance: [],
            listMedicine: [],
            search: input.search || '',
            id: '',
            qtd: input.qtd || '',
            unid: input.unid || false
        };
    },
    onInput: function (input) {
        return {
            className: input['class'],
            number: input['number'],
            buyButton: input['buy-button'] || false,
            type: input['type'],
            search: input['search'],
            unid: input['unid'],
            qtd: input['qtd']
        };
    },
    onUpdate: function (input) {
    },
    instantSearch: function (event) {
        console.log('change ', event.target.value);
        var self = this;
        self.state.search = event.target.value;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://behealthbrasil.com.br/api/search/substance/' + event.target.value, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            if (this.readyState != 4)
                return;
            if (this.status == 200) {
                var data = JSON.parse(this.responseText);
                console.log(data, data.length);
                var substances = data['substances'];
                var medicines = data['medicines'];
                self.state.listSubstance = [];
                self.state.listMedicine = [];
                if (substances.length) {
                    console.log('add');
                    for (let i = 0; i < substances.length; i++) {
                        self.state.listSubstance.push(substances[i]);
                        if (i > 5) {
                            self.setStateDirty('listSubstance');
                            break;
                        }
                    }
                    self.setStateDirty('listSubstance');
                } else {
                    console.log('clear');
                    self.state.listSubstance = [];
                }
                if (medicines.length) {
                    console.log('add');
                    for (let i = 0; i < medicines.length; i++) {
                        self.state.listMedicine.push(medicines[i]);
                        if (i > 5) {
                            self.setStateDirty('listMedicine');
                            break;
                        }
                    }
                    self.setStateDirty('listMedicine');
                } else {
                    console.log('clear medicine');
                    self.state.listMedicine = [];
                }
            }
        };
        if (self.state.search == '') {
            this.clearSearch();
        } else {
            xhr.send();
        }
    },
    chooseSubstance: function (substance) {
        console.log(substance);
        this.state.search = substance.keys[0];
        this.state.id = substance.id;
        this.state.listSubstance = [];
        this.state.unid = substance.unid;
    },
    chooseMedicine: function (medicine) {
        console.log('chooseMedicine', medicine);
        pubsub.emit('chooseMedicine', medicine);
        this.state.listMedicine = [];
        this.setStateDirty('listMedicine');
    },
    saveToMedicine: function (event) {
        this.state.qtd = event.target.value;
        pubsub.emit('chooseSubstance', this.state.id, this.state.qtd, this.state.search, this.state.unid);
    },
    clearSearch: function () {
        this.state.listSubstance = [];
        this.state.listMedicine = [];
        this.setStateDirty('listSubstance');
        this.setStateDirty('listMedicine');
        this.state.search = '';
    }
}),
    marko_components = require("marko/components"),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/div-col-form-substancia/index.marko", function() {
      return module.exports;
    }),
    pubsub = require("raptor-pubsub"),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_escapeXml = marko_helpers.x,
    marko_attr = marko_helpers.a,
    marko_forEach = marko_helpers.f;

function render(input, out, __component, component, state) {
  var data = input;

  out.w("<div class=\"col-xs-12 ontop\"" +
    marko_attr("id", __component.id) +
    "><div class=\"form-group col-xs-12 col-sm-8\"><label>Substância " +
    marko_escapeXml(input.number) +
    "</label><input type=\"text\" class=\"form-control\" name=\"substancia\" placeholder=\"\"" +
    marko_attr("value", state.search) +
    marko_attr("data-_oninput", __component.d("instantSearch"), false) +
    ">");

  if (state.listSubstance.length > 0) {
    out.w("<div class=\"instant-result col-xs-6 col-md-8\"><p>Substâncias</p>");

    marko_forEach(state.listSubstance, function(item) {
      if (item.keys.length > 0) {
        out.w("<div class=\"instant-result-item\"" +
          marko_attr("data-_onclick", __component.d("chooseSubstance", [
            item
          ]), false) +
          ">" +
          marko_escapeXml(item.keys[0]) +
          "</div>");
      }
    });

    out.w("<a href=\"#\"" +
      marko_attr("data-_onclick", __component.d("clearSearch"), false) +
      ">limpar busca</a></div>");
  }

  if (state.listMedicine.length > 0) {
    out.w("<div class=\"instant-result col-xs-6 col-md-8\" style=\"left:55%;\"><p>Formúlas</p>");

    marko_forEach(state.listMedicine, function(item) {
      out.w("<div class=\"instant-result-item\"" +
        marko_attr("data-_onclick", __component.d("chooseMedicine", [
          item
        ]), false) +
        ">" +
        marko_escapeXml(item.label) +
        "</div>");
    });

    out.w("<a href=\"#\"" +
      marko_attr("data-_onclick", __component.d("clearSearch"), false) +
      ">limpar busca</a></div>");
  }

  out.w("</div><div class=\"form-group col-xs-12 col-sm-4\"><label>Quantidade ");

  if (state.unid) {
    out.w("(" +
      marko_escapeXml(state.unid) +
      ")");
  }

  out.w("</label><input type=\"text\" class=\"form-control\" name=\"substancia\" placeholder=\"\"" +
    marko_attr("value", state.qtd) +
    marko_attr("data-_oninput", __component.d("saveToMedicine"), false) +
    "></div></div>");
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
          code: ".instant-result {\n    position: absolute;\n    background-color: white;\n    border: 1px solid rgba(0,0,0,0.2);\n    top: 67px;\n    left: 29px;\n    z-index:10;\n  }\n  .ontop{\n  }\n  .instant-result-item{\n    padding: 10px 20px;\n    margin-left:-15px;\n    margin-right:-15px;\n\n  }\n  .instant-result-item a{\n    text-align: right;\n    width: 100%;\n    display: block;\n    margin-bottom: 7px;\n  }\n  .instant-result-item:hover{\n    background-color:rgba(0,0,0,0.2);\n  }",
          virtualPath: "./index.marko.css",
          path: "./index.marko"
        },
      {
          type: "require",
          path: "./"
        }
    ]
  };
