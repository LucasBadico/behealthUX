// Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = ({
    onCreate: function (input) {
        Number.prototype.formatMoney = function (c, d, t) {
            var n = this, c = isNaN(c = Math.abs(c)) ? 2 : c, d = d == undefined ? '.' : d, t = t == undefined ? ',' : t, s = n < 0 ? '-' : '', i = String(parseInt(n = Math.abs(Number(n) || 0).toFixed(c))), j = (j = i.length) > 3 ? j % 3 : 0;
            return s + (j ? i.substr(0, j) + t : '') + i.substr(j).replace(/(\d{3})(?=\d)/g, '$1' + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : '');
        };
        this.state = {
            substancia: [{
                    type: 'search',
                    value: ''
                }],
            receipes: 1,
            cacheReceipes: [],
            cacheSubstance: {},
            cacheSubsComp: {},
            cart: [],
            upload: [],
            images: [],
            cartTotal: 0..formatMoney(2, ',', '.'),
            notListed: false,
            showSearch: 'true'
        };
        this.state['id'] = function (a) {
            if (a > 1) {
                return false;
            }
            return 'words';
        }(this.state.substancia);
    },
    onMount: function () {
        var self = this;
        var pharmacie = '424a8f61-3e2f-44d4-b6a5-f321269f5b7d';
        Number.prototype.formatMoney = function (c, d, t) {
            var n = this, c = isNaN(c = Math.abs(c)) ? 2 : c, d = d == undefined ? '.' : d, t = t == undefined ? ',' : t, s = n < 0 ? '-' : '', i = String(parseInt(n = Math.abs(Number(n) || 0).toFixed(c))), j = (j = i.length) > 3 ? j % 3 : 0;
            return s + (j ? i.substr(0, j) + t : '') + i.substr(j).replace(/(\d{3})(?=\d)/g, '$1' + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : '');
        };
        pubsub.on('chooseSubstance', function (key, value, key2, value2) {
            console.log('chooseSubstance', key, value);
            self.state.cacheSubstance[key] = value;
            self.state.cacheSubsComp[key2] = {
                unid: value2,
                qtd: value
            };
        });
        pubsub.on('uploadReceipe', function (id) {
            self.state.upload.push(id);
        });
        pubsub.on('setQtd', function (data) {
            self.state.cart[data.target].qtd = data.value;
            var total = 0;
            console.log(self.state.cart);
            for (var i = 0; i < self.state.cart.length; i++) {
                console.log('item', self.state.cart[i]);
                if (self.state.cart[i].label != 'Formula não Listada') {
                    total += self.state.cart[i].qtd * self.state.cart[i].price;
                    console.log('total', total);
                } else {
                    self.state.notListed = true;
                }
            }
            self.state.cartTotal = total.formatMoney(2, ',', '.');
            self.setStateDirty('cartTotal');
        });
        pubsub.on('chooseMedicine', function (data) {
            self.state.cart.push(data);
            self.setStateDirty('cart');
        });
    },
    onUpdate: function () {
        if (this.state.cart.length < 1 && this.state.images.length < 1) {
            this.state.showSearch = 'true';
        } else {
            this.state.showSearch = 'false';
        }
    },
    onInput: function (input) {
        return {
            size: input.size || 'normal',
            variant: input.variant || 'primary',
            body: input.label || input.renderBody,
            className: input['class']
        };
    },
    addSubstancia: function (event) {
        this.state.substancia.push({
            type: 'search',
            value: ''
        });
        this.setStateDirty('substancia');
        console.log(this.state.substancia);
    },
    searchFormula: function (event) {
        console.log('search formula', this.state.cacheSubstance);
        var self = this;
        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://behealthbrasil.com.br/api/search/medicine/', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            if (this.readyState != 4)
                return;
            if (this.status == 200) {
                console.log(this.responseText);
                var medicine = JSON.parse(this.responseText);
                if (medicine) {
                    self.state.cart.push(medicine);
                    self.setStateDirty('cart');
                } else {
                    var keys = [];
                    console.log('cached comp', self.state.cacheSubsComp);
                    for (var prop in self.state.cacheSubsComp) {
                        keys.push(' ' + prop + ' ' + self.state.cacheSubsComp[prop].qtd + ' ' + self.state.cacheSubsComp[prop].unid);
                    }
                    console.log('new comp', self.state.cacheSubsComp, keys);
                    var item = {
                        label: 'Formula não Listada',
                        composition: keys,
                        keys: self.state.cacheSubstance,
                        qtd: 0
                    };
                    self.state.cart.push(item);
                    self.setStateDirty('cart');
                    self.state.notListed = true;
                }
                console.log(self.state.cart);
                self.state.substancia = [{
                        type: 'search',
                        value: ''
                    }];
            }
        };
        console.log('sendData', self.state.cacheSubstance);
        var sendData = JSON.stringify(self.state.cacheSubstance);
        xhr.send(sendData);
    },
    addcart: function () {
        var item = this.state.cart[0];
        pubsub.emit('onAddCartItem', { item: item });
        this.state = {
            substancia: [{
                    type: 'search',
                    value: ''
                }],
            receipes: 1,
            cacheReceipes: [],
            cacheSubstance: {},
            cacheSubsComp: {},
            cart: [],
            upload: [],
            images: [],
            cartTotal: 0..formatMoney(2, ',', '.'),
            notListed: false
        };
    },
    clear: function () {
        this.state.substancia = [{
                type: 'search',
                value: ''
            }];
        this.state.receipes = 1;
        this.state.cacheReceipes = [];
        this.state.cacheSubstance = {};
        this.state.cacheSubsComp = {};
        this.state.cart = [];
        this.state.upload = [];
        this.state.images = [];
        this.state.cartTotal = 0..formatMoney(2, ',', '.');
        this.state.notListed = false;
    },
    preorder: function () {
        console.log(this.state.cart);
        var xhr = new XMLHttpRequest();
        xhr.open('PUT', 'https://behealthbrasil.com.br/api/order', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            if (this.readyState != 4)
                return false;
            if (this.status == 200) {
                pubsub.emit('showModal', {
                    type: 'preorder',
                    thisid: this.responseText
                });
            }
        };
        var data = {
            cart: this.state.cart,
            receipes: this.state.upload
        };
        xhr.send(JSON.stringify(data));
        this.emit('click', { event: event });
    },
    removeItem: function (i) {
        console.log('remove', i);
        this.state.cart.splice(i, 1);
        this.setStateDirty('cart');
    },
    showPanel: function (id) {
        console.log(id);
        console.log(this.target);
        $('.active').removeClass('active');
        var id = $(this.target).data('id');
        console.log('id', id);
        $(this.target).addClass('active');
        $('#' + id).addClass('active');
    },
    sendPhoto: function (evt) {
        console.info('evento ->', evt.target.files);
        var self = this;
        var files = evt.target.files;
        var formData = new FormData();
        formData.append('file', files[0]);
        console.log(formData);
        $.ajax({
            url: 'https://behealthbrasil.com.br/api/receipe',
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function (data) {
                console.info('files', data);
                var imageUrl = 'data:' + data.type + ';base64,' + Buffer.from(data.file).toString('base64');
                self.state.images.push(imageUrl);
                self.setStateDirty('images');
                pubsub.emit('uploadReceipe', data.id);
            }
        });
    }
}),
    marko_components = require("marko/components"),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/section-hero-search/index.marko", function() {
      return module.exports;
    }),
    pubsub = require("raptor-pubsub"),
    marko_forRange = require("marko/runtime/helper-forRange"),
    marko_loadTemplate = require("marko/runtime/helper-loadTemplate"),
    div_col_form_substancia_template = marko_loadTemplate(require.resolve("../div-col-form-substancia")),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_loadTag = marko_helpers.t,
    div_col_form_substancia_tag = marko_loadTag(div_col_form_substancia_template),
    marko_attr = marko_helpers.a,
    marko_classAttr = marko_helpers.ca,
    marko_escapeXml = marko_helpers.x,
    app_number_spinner_template = marko_loadTemplate(require.resolve("../app-number-spinner")),
    app_number_spinner_tag = marko_loadTag(app_number_spinner_template),
    marko_forEach = marko_helpers.f;

function render(input, out, __component, component, state) {
  var data = input;

  out.w("<section" +
    marko_attr("id", __component.id) +
    "><div id=\"search\"><div id=\"hero\" style=\"position: relative; height: inherit; background: none;&#10;      background-size: cover; color: #fff; width: 100%; font-size: 16px; display: table; z-index: 99; text-align: center;  text-transform: uppercase;\"><div class=\"intro_title\" style=\" padding-bottom: 5%; padding-top: 5%;\"><h3 style=\"font-weight: bolder;\" class=\"animated fadeInDown\">Compare e compre <span style=\"color:white;\">manipulados</span> no único <span style=\"color:white;\">comparador de preços</span> do Brasil</h3><p class=\"animated fadeInDown\">Seguro. Rápido. Prático e sempre pelo menor preço! </p></div></div><ul class=\"nav nav-tabs\"></ul><div class=\"tab-content\"><div class=\"tab-pane active\" id=\"buscar\"><div" +
    marko_classAttr([
      "row",
      state.showSearch
    ]) +
    "><div class=\"col-xs-12 col-sm-7\" style=\"margin-right: -5%;  margin-left: -5%;\"><h3 style=\"margin-left: 5%;\">Faça sua busca pela composição do medicamento, substância a substância</h3>");

  marko_forRange(1, state.substancia.length, null, function(i) {
    div_col_form_substancia_tag({
        number: [
            i
          ],
        type: state.substancia[i - 1].type,
        search: state.substancia[i - 1].value
      }, out);
  });

  out.w("<div class=\"\" style=\" padding: 0 15px;  padding-bottom: 13px;\"><div class=\"form-group col-xs-12\" style=\"position: static;\"><button class=\"btn_1 green outline btn-block\"" +
    marko_attr("data-_onclick", __component.d("addSubstancia"), false) +
    "><i class=\"icon-plus\"></i> Outra substância</button></div><div class=\"form-group col-xs-12\"><button class=\"btn_1 green btn-block\"" +
    marko_attr("data-_onclick", __component.d("searchFormula"), false) +
    "><i class=\"icon-search-1\"></i> Buscar <span> Formúla </span></button></div></div></div><div class=\"col-xs-12 col-sm-5 photoIcon\"><h3>Envie nos sua receita.</h3><div class=\"col-xs-12\" style=\"padding:0;\"><div class=\"col-xs-12\"><div class=\"form-group\"><label>Tire uma foto</label><input type=\"file\" name=\"file-6\" class=\"form-control\" style=\"padding-left: 17px; padding-top: 10px; position: relative; z-index:100;background-color: transparent;\"" +
    marko_attr("data-_onchange", __component.d("sendPhoto"), false) +
    "><label for=\"file-6\" style=\"position: absolute; top: 36px;\"><span style=\"width:165px\"></span><strong style=\"    background-color: #15aa7b; width: 170px; text-align: center; padding: 10px; color: white; border-radius: 3px; margin-left: 3px;\"><i class=\"icon-camera-7\"></i> Tire uma foto&hellip;</strong></label></div></div><div class=\"col-xs-12\"><div class=\"form-group\"><label>Faça upload</label><input class=\"form-control\" name=\"file-7\" type=\"file\" style=\" padding-left: 60px; padding-top: 11px; position: relative; z-index:100;background-color: transparent;\"" +
    marko_attr("data-_onchange", __component.d("sendPhoto"), false) +
    "><label for=\"file-7\" style=\" padding: 0px; line-height: 35px; margin-top: 2px; position: absolute; top: 26px;\"><span style=\"width:165px\"></span><strong style=\"fill:white;background-color: #15aa7b; padding: 10px; padding-right: 15px; margin-left: 3px; border-radius: 2px;color: white;\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"17\" viewBox=\"0 0 20 17\"><path d=\"M10 0l-5.2 4.9h3.3v5.1h3.8v-5.1h3.3l-5.2-4.9zm9.3 11.5l-3.2-2.1h-2l3.4 2.6h-3.5c-.1 0-.2.1-.2.1l-.8 2.3h-6l-.8-2.2c-.1-.1-.1-.2-.2-.2h-3.6l3.4-2.6h-2l-3.2 2.1c-.4.3-.7 1-.6 1.5l.6 3.1c.1.5.7.9 1.2.9h16.3c.6 0 1.1-.4 1.3-.9l.6-3.1c.1-.5-.2-1.2-.7-1.5z\"></path></svg> Escolha um arquivo&hellip;</strong></label></div></div></div></div></div>");

  if (state.cart.length > 0) {
    out.w("<div class=\"row\"><div style=\"padding: 15px;\"><p" +
      marko_classAttr([
        "message",
        "col-xs-12",
        state.messageType
      ]) +
      " style=\"margin-right:10px;\">Se essa é a formula que você procura, selecione a quantidade e adicione-a ao seu carrinho.</p><table class=\"table table-hover\" id=\"table\"><thead><tr><th class=\"col-md-2\">Nome</th><th class=\"col-md-3\">Fórmula</th><th class=\"col-md-4\">Quantidade</th></tr></thead><tbody>");

    marko_forRange(0, state.cart.length - 1, null, function(i) {
      out.w("<tr><td>" +
        marko_escapeXml(state.cart[i].label) +
        "</td><td>" +
        marko_escapeXml(state.cart[i].composition) +
        "</td><td>");

      app_number_spinner_tag({
          value: state.cart[i].qtd,
          index: i
        }, out);

      out.w(marko_escapeXml(state.cart[i].unidade) +
        "</td></tr>");
    });

    out.w("</tbody></table></div>");

    if (state.notListed) {
      out.w("<div class=\"col-xs-12\"><button class=\"btn_1 green outline col-xs-4\" style=\" top: 7px; position: relative; margin-bottom: 10px;\"" +
        marko_attr("data-_onclick", __component.d("preorder"), false) +
        "><i class=\"icon-email\"></i> Pedir orçamento</button></div>");
    } else {
      out.w("<div class=\"col-xl-12\" style=\"margin-bottom: 20px;  margin-left: 20px;\"><span class=\"price-value\">R$ " +
        marko_escapeXml(state.cartTotal) +
        "</span><span class=\"mo\"> seu menor preço </span><span class=\"mo2\">pelas " +
        marko_escapeXml(state.cart[0].qtd) +
        " " +
        marko_escapeXml(state.cart[0].unidade) +
        "</span></div><div class=\"col-xs-12\"><button class=\"btn_1 green col-xs-5\" style=\"margin-right:10px;\"" +
        marko_attr("data-_onclick", __component.d("addcart"), false) +
        "><i class=\"icon-plus\"></i> Addicionar ao carrinho</button><button class=\"btn_1 green outline col-xs-5\" style=\"position: relative; margin-bottom: 10px;\"" +
        marko_attr("data-_onclick", __component.d("clear"), false) +
        "><i class=\"icon-search-1\"></i> Buscar outra formula</button></div>");
    }

    out.w("</div>");
  }

  if (state.images.length > 0) {
    out.w("<div class=\"row\"><h2 class=\"receipe\">Suas receitas</h2><p" +
      marko_classAttr([
        "message",
        "col-xs-12",
        state.messageType
      ]) +
      " style=\"margin-right:10px;margin-top:20px;\">Se precisar envie outro arquivo.</p><div class=\"col-xs-6\"><div class=\"form-group\"><label>Faça upload</label><input class=\"form-control\" name=\"file-7\" type=\"file\" style=\" padding-left: 60px; padding-top: 11px; position: relative; z-index:100;background-color: transparent;\"" +
      marko_attr("data-_onchange", __component.d("sendPhoto"), false) +
      "><label for=\"file-7\" style=\" padding: 0px; line-height: 35px; margin-top: 2px; position: absolute; top: 26px;\"><span style=\"width:165px\"></span><strong style=\"fill:white;background-color: #15aa7b; padding: 10px; padding-right: 15px; margin-left: 3px; border-radius: 2px;color: white;\"><i class=\"icon-upload\"></i> Escolha um arquivo&hellip;</strong></label></div></div><div class=\"col-xs-6\"><div class=\"form-group\"><label>Tire uma foto</label><input type=\"file\" name=\"file-6\" class=\"form-control\" style=\"padding-left: 17px; padding-top: 10px; position: relative; z-index:100;background-color: transparent;\"" +
      marko_attr("data-_onchange", __component.d("sendPhoto"), false) +
      "><label for=\"file-6\" style=\"position: absolute; top: 36px;\"><span style=\"width:165px\"></span><strong style=\"    background-color: #15aa7b; width: 170px; text-align: center; padding: 10px; color: white; border-radius: 3px; margin-left: 3px;\"><i class=\"icon-camera-7\"></i> Tire uma foto&hellip;</strong></label></div></div>");

    marko_forEach(state.images, function(item) {
      out.w("<div class=\"col-xs-6 col-sm-4\"><img" +
        marko_attr("src", item) +
        " class=\"img-responsive\"></div>");
    });

    out.w("<div class=\"col-xs-12\"><p" +
      marko_classAttr([
        "message",
        "col-xs-12",
        state.messageType
      ]) +
      " style=\"margin-right:10px; margin-top: -20px;\">Assim que tiver terminado de subir as receitas, clique em pedir orçamento</p><button class=\"btn_1 green col-xs-5\" style=\"margin-right:10px;\"" +
      marko_attr("data-_onclick", __component.d("preorder"), false) +
      "><i class=\"icon-email\"></i> Pedir Orçamento</button><button class=\"btn_1 green outline col-xs-5\" style=\"position: relative; margin-bottom: 10px;\"" +
      marko_attr("data-_onclick", __component.d("clear"), false) +
      "><i class=\"icon-search-1\"></i> Reiniciar a busca</button></div></div>");
  }

  out.w("</div><div class=\"row\"><hr><a class=\"btn_1 green outline\" style=\" top: 7px; position: relative; margin-bottom: 10px;\" href=\"/cart\"><i class=\"icon-cart\"></i> ir para o carrinho</a></div></div></div></section>");
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType,
    id: "search_container"
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

marko_template.meta = {
    deps: [
      "./style.less",
      {
          type: "css",
          code: ".true{\n    display:block;\n  }\n\n  .false{\n    display:none;\n  }\n\n  #hero .intro_title p {\n    text-shadow: 2px 2px 2px rgba(100, 100, 100, 1);\n  }\n\n  .message {\n    background-color: lightgoldenrodyellow;\n    font-weight: 600;\n    text-align: center;\n    padding: 3px 0;\n    border-radius: 5px;\n    margin-bottom: 14px;\n  }\n\n  .error {\n    color: white;\n    background-color: red;\n  }\n\n  #table td{\n    vertical-align: middle !important;\n  }\n\n  .price-value {\n    font-size: 32px;\n    font-weight: 600;\n\n  }\n\n  .mo{\n    padding: 2px 4px;\n    border: 2px solid #82ca9c;\n    margin-left: 9px;\n    top: -6px;\n    position: relative;\n    color: white;\n    font-weight: 600;\n    background: #82ca9c;\n\n  }\n\n  .mo2{\n    padding: 2px 4px;\n    /* border: 2px solid #82ca9c; */\n    margin-left: 9px;\n    top: 11px;\n    left: -129px;\n    position: relative;\n    font-weight: 600;\n  }\n\n  .receipe{\n    font-weight: 600;\n    margin-bottom: 10px;\n  }\n\n  .photoIcon:before {\n    content: \"ou\";\n    position: absolute;\n    display: flex;\n    padding-left: 4px;\n    padding-top: 2px;\n    border-radius: 100%;\n    width: 25px;\n    height: 25px;\n    text-align: center;\n    vertical-align: initial;\n    color: white;\n    font-weight: 800;\n    top: 40%;\n    background: rgb(150,150,150);\n    text-transform: capitalize;\n    left: -13px;\n  }\n\n  .photoIcon {\n    border-left: 1px solid rgba(0,0,0,0.3);\n    margin-left: 35px;\n    padding: 0;\n    padding-left: 19px;\n  }",
          virtualPath: "./index.marko.css",
          path: "./index.marko"
        },
      {
          type: "require",
          path: "./"
        }
    ],
    tags: [
      "../div-col-form-substancia",
      "../app-number-spinner"
    ]
  };
