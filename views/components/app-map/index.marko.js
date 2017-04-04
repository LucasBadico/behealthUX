// Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = ({
    onMount: function () {
        var el = this.el;
        var google = window.google;
        var lat = this.input.lat;
        var lng = this.input.lng;
        if (google && google.maps && google.maps.Map) {
            var Map = google.maps.Map;
            var LatLng = google.maps.LatLng;
            this._map = new Map(el, {
                zoom: 8,
                center: new LatLng(lat, lng)
            });
        } else {
            this.innerHTML = 'Failed to load Google Maps API. Is your internet connection working?';
        }
    }
}),
    marko_widgets = require("marko/widgets"),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/fullstack-challenge$1.0.0/views/components/app-map/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_classAttr = marko_helpers.ca,
    marko_styleAttr = marko_helpers.sa,
    marko_attr = marko_helpers.a;

function render(input, out, widget, state) {
  var data = input;

  var height=input.height

  var width=input.width

  out.w("<div" +
    marko_classAttr([
      "app-map",
      input["class"]
    ]) +
    marko_styleAttr({
      height: height,
      width: width
    }) +
    marko_attr("id", widget.id) +
    "></div>");
}

marko_template._ = marko_widgets.r(render, {
    type: marko_widgetType
  }, marko_component);

marko_template.Widget = marko_widgets.w(marko_component, marko_template._);

marko_template.meta = {
    deps: [
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
