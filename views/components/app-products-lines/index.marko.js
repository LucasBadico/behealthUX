// Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
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
    marko_widgets = require("marko/widgets"),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/behealth$0.0.1/views/components/app-products-lines/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_attr = marko_helpers.a;

function render(input, out, widget, state) {
  var data = input;

  var variantClassName = (input.variant !== 'primary' && 'app-button-' + input.variant);

  var sizeClassName = (input.size !== 'normal' && 'app-button-' + input.size);

  out.w("<div class=\"container margin_60 bg_white bg-white\"" +
    marko_attr("id", widget.id) +
    "><div class=\"main_title\"><h2>Produtos em <span>destaque</span></h2><p>O menor preço garantido. Aqui a gente cobre qualquer oferta</p></div><div class=\"row\"><div class=\"col-md-4 col-sm-6 wow zoomIn\" data-wow-delay=\"0.1s\"><div class=\"tour_container\"><div class=\"img_container\"><a href=\"single_tour.html\"> <img src=\"img/tour_box_1.jpg\" class=\"img-responsive\" alt=\"\"><div class=\"ribbon top_rated\"></div><div class=\"short_info\"> <i class=\"icon_set_1_icon-44\"></i>Historic Buildings<span class=\"price\"><sup>R$</sup>39</span> </div></a></div><div class=\"tour_title\"><h3><strong>Loren Dolor</strong> Categoria</h3><div class=\"rating\"> <i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile\"></i><small>(75)</small> </div><div class=\"wishlist\"> <a class=\"tooltip_flip tooltip-effect-1\" href=\"javascript:void(0);\">+<span class=\"tooltip-content-flip\"><span class=\"tooltip-back\">Add to wishlist</span></span></a> </div></div></div></div><div class=\"col-md-4 col-sm-6 wow zoomIn\" data-wow-delay=\"0.2s\"><div class=\"tour_container\"><div class=\"img_container\"><a href=\"single_tour.html\"> <img src=\"img/tour_box_2.jpg\" width=\"800\" height=\"533\" class=\"img-responsive\" alt=\"\"><div class=\"ribbon top_rated\"></div><div class=\"badge_save\">OFF<strong>30%</strong></div><div class=\"short_info\"> <i class=\"icon_set_1_icon-43\"></i>Churches<span class=\"price\"><sup>R$</sup>45</span> </div></a></div><div class=\"tour_title\"><h3><strong>Loren Dolor</strong> Categoria</h3><div class=\"rating\"> <i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile\"></i><small>(75)</small> </div><div class=\"wishlist\"> <a class=\"tooltip_flip tooltip-effect-1\" href=\"javascript:void(0);\">+<span class=\"tooltip-content-flip\"><span class=\"tooltip-back\">Add to wishlist</span></span></a> </div></div></div></div><div class=\"col-md-4 col-sm-6 wow zoomIn\" data-wow-delay=\"0.3s\"><div class=\"tour_container\"><div class=\"img_container\"><a href=\"single_tour.html\"> <img src=\"img/tour_box_3.jpg\" width=\"800\" height=\"533\" class=\"img-responsive\" alt=\"\"><div class=\"ribbon popular\"></div><div class=\"badge_save\">OFF<strong>30%</strong></div><div class=\"short_info\"> <i class=\"icon_set_1_icon-44\"></i>Historic Buildings<span class=\"price\"><sup>R$</sup>48</span> </div></a></div><div class=\"tour_title\"><h3><strong>Loren Dolor</strong> Categoria</h3><div class=\"rating\"> <i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile\"></i><small>(75)</small> </div><div class=\"wishlist\"> <a class=\"tooltip_flip tooltip-effect-1\" href=\"javascript:void(0);\">+<span class=\"tooltip-content-flip\"><span class=\"tooltip-back\">Add to wishlist</span></span></a> </div></div></div></div><div class=\"col-md-4 col-sm-6 wow zoomIn\" data-wow-delay=\"0.4s\"><div class=\"tour_container\"><div class=\"img_container\"><a href=\"single_tour.html\"> <img src=\"img/tour_box_4.jpg\" width=\"800\" height=\"533\" class=\"img-responsive\" alt=\"\"><div class=\"ribbon popular\"></div><div class=\"short_info\"> <i class=\"icon_set_1_icon-30\"></i>Walking tour<span class=\"price\"><sup>R$</sup>36</span> </div></a></div><div class=\"tour_title\"><h3><strong>Loren Dolor</strong> Categoria</h3><div class=\"rating\"> <i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile\"></i><small>(75)</small> </div><div class=\"wishlist\"> <a class=\"tooltip_flip tooltip-effect-1\" href=\"javascript:void(0);\">+<span class=\"tooltip-content-flip\"><span class=\"tooltip-back\">Add to wishlist</span></span></a> </div></div></div></div><div class=\"col-md-4 col-sm-6 wow zoomIn\" data-wow-delay=\"0.5s\"><div class=\"tour_container\"><div class=\"img_container\"><a href=\"single_tour.html\"> <img src=\"img/tour_box_14.jpg\" width=\"800\" height=\"533\" class=\"img-responsive\" alt=\"\"><div class=\"ribbon popular\"></div><div class=\"short_info\"> <i class=\"icon_set_1_icon-28\"></i>Skyline tours<span class=\"price\"><sup>R$</sup>42</span> </div></a></div><div class=\"tour_title\"><h3><strong>Loren Dolor</strong> Categoria</h3><div class=\"rating\"> <i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile\"></i><small>(75)</small> </div><div class=\"wishlist\"> <a class=\"tooltip_flip tooltip-effect-1\" href=\"javascript:void(0);\">+<span class=\"tooltip-content-flip\"><span class=\"tooltip-back\">Add to wishlist</span></span></a> </div></div></div></div><div class=\"col-md-4 col-sm-6 wow zoomIn\" data-wow-delay=\"0.6s\"><div class=\"tour_container\"><div class=\"img_container\"><a href=\"single_tour.html\"> <img src=\"img/tour_box_5.jpg\" width=\"800\" height=\"533\" class=\"img-responsive\" alt=\"\"><div class=\"ribbon top_rated\"></div><div class=\"short_info\"> <i class=\"icon_set_1_icon-44\"></i>Historic Buildings<span class=\"price\"><sup>R$</sup>40</span> </div></a></div><div class=\"tour_title\"><h3><strong>Loren Dolor</strong> Categoria</h3><div class=\"rating\"> <i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile\"></i><small>(75)</small> </div><div class=\"wishlist\"> <a class=\"tooltip_flip tooltip-effect-1\" href=\"javascript:void(0);\">+<span class=\"tooltip-content-flip\"><span class=\"tooltip-back\">Add to wishlist</span></span></a> </div></div></div></div><div class=\"col-md-4 col-sm-6 wow zoomIn\" data-wow-delay=\"0.7s\"><div class=\"tour_container\"><div class=\"img_container\"><a href=\"single_tour.html\"> <img src=\"img/tour_box_8.jpg\" width=\"800\" height=\"533\" class=\"img-responsive\" alt=\"\"><div class=\"ribbon top_rated\"></div><div class=\"short_info\"> <i class=\"icon_set_1_icon-3\"></i>City sightseeing<span class=\"price\"><sup>R$</sup>35</span> </div></a></div><div class=\"tour_title\"><h3><strong>Loren Dolor</strong> Categoria</h3><div class=\"rating\"> <i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile\"></i><small>(75)</small> </div><div class=\"wishlist\"> <a class=\"tooltip_flip tooltip-effect-1\" href=\"javascript:void(0);\">+<span class=\"tooltip-content-flip\"><span class=\"tooltip-back\">Add to wishlist</span></span></a> </div></div></div></div><div class=\"col-md-4 col-sm-6 wow zoomIn\" data-wow-delay=\"0.8s\"><div class=\"tour_container\"><div class=\"img_container\"><a href=\"single_tour.html\"> <img src=\"img/tour_box_9.jpg\" width=\"800\" height=\"533\" class=\"img-responsive\" alt=\"\"><div class=\"ribbon top_rated\"></div><div class=\"short_info\"> <i class=\"icon_set_1_icon-4\"></i>Museums<span class=\"price\"><sup>R$</sup>38</span> </div></a></div><div class=\"tour_title\"><h3><strong>Loren Dolor</strong> Categoria</h3><div class=\"rating\"> <i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile\"></i><small>(75)</small> </div><div class=\"wishlist\"> <a class=\"tooltip_flip tooltip-effect-1\" href=\"javascript:void(0);\">+<span class=\"tooltip-content-flip\"><span class=\"tooltip-back\">Add to wishlist</span></span></a> </div></div></div></div><div class=\"col-md-4 col-sm-6 wow zoomIn\" data-wow-delay=\"0.9s\"><div class=\"tour_container\"><div class=\"img_container\"><a href=\"single_tour.html\"> <img src=\"img/tour_box_12.jpg\" width=\"800\" height=\"533\" class=\"img-responsive\" alt=\"\"><div class=\"ribbon top_rated\"></div><div class=\"short_info\"> <i class=\"icon_set_1_icon-14\"></i>Eat &amp; drink<span class=\"price\"><sup>R$</sup>25</span> </div></a></div><div class=\"tour_title\"><h3><strong>Loren Dolor</strong> Categoria</h3><div class=\"rating\"> <i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile voted\"></i><i class=\"icon-smile\"></i><small>(75)</small> </div><div class=\"wishlist\"> <a class=\"tooltip_flip tooltip-effect-1\" href=\"javascript:void(0);\">+<span class=\"tooltip-content-flip\"><span class=\"tooltip-back\">Add to wishlist</span></span></a> </div></div></div></div></div><p class=\"text-center nopadding\"> <a href=\"#\" class=\"btn_1 medium\"><i class=\"icon-eye-7\"></i>Veja todos os produtos</a> </p></div>");
}

marko_template._ = marko_widgets.r(render, {
    type: marko_widgetType
  }, marko_component);

marko_template.Widget = marko_widgets.w(marko_component, marko_template._);

marko_template.meta = {
    deps: [
      "./style.less",
      {
          type: "require",
          path: "./index.marko"
        },
      {
          type: "require",
          path: "marko/widgets"
        }
    ]
  };
