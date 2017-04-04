// Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = require("./component"),
    marko_widgets = require("marko/widgets"),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/fullstack-challenge$1.0.0/views/components/app/index.marko", function() {
      return module.exports;
    }),
    marko_loadTemplate = require("marko/runtime/helper-loadTemplate"),
    app_button_template = marko_loadTemplate(require.resolve("../app-button")),
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_loadTag = marko_helpers.t,
    app_button_tag = marko_loadTag(app_button_template),
    app_checkbox_template = marko_loadTemplate(require.resolve("../app-checkbox")),
    app_checkbox_tag = marko_loadTag(app_checkbox_template),
    marko_forEachProp = require("marko/runtime/helper-forEachProperty"),
    marko_escapeXml = marko_helpers.x,
    app_notifications_template = marko_loadTemplate(require.resolve("../app-notifications")),
    app_notifications_tag = marko_loadTag(app_notifications_template),
    w_preserve_tag = marko_loadTag(require("marko/widgets/taglib/preserve-tag")),
    app_overlay_template = marko_loadTemplate(require.resolve("../app-overlay")),
    app_overlay_tag = marko_loadTag(app_overlay_template),
    app_tabs_template = marko_loadTemplate(require.resolve("../app-tabs")),
    app_tabs_tag = marko_loadTag(app_tabs_template),
    marko_loadNestedTag = require("marko/runtime/helper-loadNestedTag"),
    app_tabs_tab_nested_tag = marko_loadNestedTag("tabs", 1),
    marko_mergeNestedTagsHelper = require("marko/runtime/helper-mergeNestedTags"),
    app_progress_bar_template = marko_loadTemplate(require.resolve("../app-progress-bar")),
    app_progress_bar_tag = marko_loadTag(app_progress_bar_template),
    app_number_spinner_template = marko_loadTemplate(require.resolve("../app-number-spinner")),
    app_number_spinner_tag = marko_loadTag(app_number_spinner_template),
    app_state_select_template = marko_loadTemplate(require.resolve("../app-state-select")),
    app_state_select_tag = marko_loadTag(app_state_select_template),
    marko_attr = marko_helpers.a,
    app_fetch_data_template = marko_loadTemplate(require.resolve("../app-fetch-data")),
    app_fetch_data_tag = marko_loadTag(app_fetch_data_template),
    app_map_template = marko_loadTemplate(require.resolve("../app-map")),
    app_map_tag = marko_loadTag(app_map_template),
    app_sections_template = marko_loadTemplate(require.resolve("../app-sections")),
    app_sections_tag = marko_loadTag(app_sections_template);

function render(input, out, widget, state) {
  var data = input;

  out.w("<div" +
    marko_attr("id", widget.id) +
    ">");

  app_sections_tag({
      sections: [
        {
            title: "Buttons",
            renderBody: function renderBody(out) {
              out.w("<table><tr><td><b>Primary: </b></td><td>");

              app_button_tag({
                  label: "small",
                  size: "small",
                  variant: "primary"
                }, out);

              app_button_tag({
                  label: "normal",
                  size: "normal",
                  variant: "primary"
                }, out);

              app_button_tag({
                  label: "large",
                  size: "large",
                  variant: "primary"
                }, out);

              out.w("</td></tr><tr><td><b>Secondary:&nbsp;</b></td><td>");

              app_button_tag({
                  label: "small",
                  size: "small",
                  variant: "secondary"
                }, out);

              app_button_tag({
                  label: "normal",
                  size: "normal",
                  variant: "secondary"
                }, out);

              app_button_tag({
                  label: "large",
                  size: "large",
                  variant: "secondary"
                }, out);

              out.w("</td></tr></table><div>");

              app_button_tag({
                  label: "Change Button Size - " + state.buttonSize,
                  size: state.buttonSize,
                  variant: "primary",
                  $w: [
                    widget,
                    "0[]",
                    [
                      "click",
                      "handleChangeButtonSizeClick",
                      null
                    ]
                  ]
                }, out);

              app_button_tag({
                  label: "Change Button Variant - " + state.buttonVariant,
                  variant: state.buttonVariant,
                  $w: [
                    widget,
                    "1[]",
                    [
                      "click",
                      "handleChangeButtonVariantClick",
                      null
                    ]
                  ]
                }, out);

              out.w("</div>");
            }
          },
        {
            title: "Checkboxes",
            renderBody: function renderBody(out) {
              out.w("<p>");

              app_checkbox_tag({
                  label: "Foo",
                  data: {
                      name: "foo"
                    },
                  checked: state.checked.foo,
                  $w: [
                    widget,
                    "2[]",
                    [
                      "toggle",
                      "handleCheckboxToggle",
                      null
                    ]
                  ]
                }, out);

              app_checkbox_tag({
                  label: "Bar",
                  data: {
                      name: "bar"
                    },
                  checked: state.checked.bar,
                  $w: [
                    widget,
                    "3[]",
                    [
                      "toggle",
                      "handleCheckboxToggle",
                      null
                    ]
                  ]
                }, out);

              app_checkbox_tag({
                  label: "Baz",
                  data: {
                      name: "baz"
                    },
                  checked: state.checked.baz,
                  $w: [
                    widget,
                    "4[]",
                    [
                      "toggle",
                      "handleCheckboxToggle",
                      null
                    ]
                  ]
                }, out);

              out.w("</p><p>");

              app_checkbox_tag({
                  label: "Bar",
                  data: {
                      name: "bar"
                    },
                  checked: state.checked.bar,
                  $w: [
                    widget,
                    "5[]",
                    [
                      "toggle",
                      "handleCheckboxToggle",
                      null
                    ]
                  ]
                }, out);

              out.w("</p><p><b>Checked</b>: <ul>");

              marko_forEachProp(state.checked, function(key, value) {
                if (value) {
                  out.w("<li>" +
                    marko_escapeXml(key) +
                    "</li>");
                }
              });

              out.w("</ul></p><p>");

              app_checkbox_tag({
                  label: "Foo",
                  checked: true,
                  data: {
                      name: "foo"
                    },
                  $w: [
                    widget,
                    "toggleCheckbox"
                  ]
                }, out);

              app_button_tag({
                  label: "Toggle Checkbox",
                  size: "small",
                  variant: "primary",
                  $w: [
                    widget,
                    "6[]",
                    [
                      "click",
                      "handleToggleCheckboxButtonClick",
                      null
                    ]
                  ]
                }, out);

              out.w("</p>");
            }
          },
        {
            title: "Overlays",
            renderBody: function renderBody(out) {
              app_button_tag({
                  label: "Show Overlay",
                  variant: "primary",
                  $w: [
                    widget,
                    "7[]",
                    [
                      "click",
                      "handleShowOverlayButtonClick",
                      null
                    ]
                  ]
                }, out);

              app_button_tag({
                  label: "Show Notification",
                  variant: "primary",
                  $w: [
                    widget,
                    "8[]",
                    [
                      "click",
                      "handleShowNotificationButtonClick",
                      null
                    ]
                  ]
                }, out);

              var __widgetId9 = widget.elId("notifications");

              w_preserve_tag({
                  id: __widgetId9,
                  renderBody: function renderBody(out) {
                    app_notifications_tag({
                        $w: [
                          widget,
                          "#" + __widgetId9
                        ]
                      }, out);
                  }
                }, out);

              app_overlay_tag({
                  visible: state.overlayVisible,
                  $w: [
                    widget,
                    "overlay",
                    [
                      "ok",
                      "handleOverlayOk",
                      null,
                      "cancel",
                      "handleOverlayCancel",
                      null,
                      "hide",
                      "handleOverlayHide",
                      null,
                      "show",
                      "handleOverlayShow",
                      null
                    ]
                  ],
                  renderBody: function renderBody(out) {
                    out.w("<h2>Overlay Demo</h2> This is an overlay!");
                  }
                }, out);
            }
          },
        {
            title: "Tabs",
            renderBody: function renderBody(out) {
              out.w("<h3>Static tabs</h3>");

              app_tabs_tag({
                  tabs: [
                    {
                        label: "Home",
                        renderBody: function renderBody(out) {
                          out.w("Content for Home");
                        }
                      },
                    {
                        label: "Profile",
                        renderBody: function renderBody(out) {
                          out.w("Content for Profile");
                        }
                      },
                    {
                        label: "Messages",
                        renderBody: function renderBody(out) {
                          out.w("Content for Messages");
                        }
                      }
                  ]
                }, out);

              out.w("<h3>Dynamic tabs</h3>");

              app_tabs_tag(marko_mergeNestedTagsHelper({
                  renderBody: function renderBody(out, app_tabs0) {
                    marko_forEachProp(state.dynamicTabs, function(tabIndex, tab) {
                      app_tabs_tab_nested_tag({
                          label: "Tab " + tabIndex,
                          renderBody: function renderBody(out) {
                            out.w("Content for tab " +
                              marko_escapeXml(tabIndex) +
                              ": " +
                              marko_escapeXml(tab.timestamp));
                          }
                        }, app_tabs0);
                    });
                  }
                }), out);

              app_button_tag({
                  label: "Add Tab",
                  $w: [
                    widget,
                    "10[]",
                    [
                      "click",
                      "handleAddTabButtonClick",
                      null
                    ]
                  ]
                }, out);
            }
          },
        {
            title: "Miscellaneous",
            renderBody: function renderBody(out) {
              app_progress_bar_tag({
                  steps: [
                    {
                        name: "contact-info",
                        renderBody: function renderBody(out) {
                          out.w("Contact Info");
                        }
                      },
                    {
                        name: "interests",
                        renderBody: function renderBody(out) {
                          out.w("Interests");
                        }
                      },
                    {
                        name: "family",
                        renderBody: function renderBody(out) {
                          out.w("Family");
                        }
                      }
                  ]
                }, out);

              out.w("<br>");

              app_number_spinner_tag({}, out);

              out.w("<br>");

              app_state_select_tag({}, out);
            }
          },
        {
            title: "Client-side Rendering",
            renderBody: function renderBody(out) {
              app_button_tag({
                  label: "Render a button",
                  $w: [
                    widget,
                    "11[]",
                    [
                      "click",
                      "handleRenderButtonClick",
                      null
                    ]
                  ]
                }, out);

              app_button_tag({
                  label: "Render a checkbox",
                  $w: [
                    widget,
                    "12[]",
                    [
                      "click",
                      "handleRenderCheckboxButtonClick",
                      null
                    ]
                  ]
                }, out);

              app_button_tag({
                  label: "Render a progress bar",
                  $w: [
                    widget,
                    "13[]",
                    [
                      "click",
                      "handleRenderProgressBarButtonClick",
                      null
                    ]
                  ]
                }, out);

              var __widgetId14 = widget.elId("renderTarget");

              out.w("<div class=\"render-target\"" +
                marko_attr("id", __widgetId14) +
                ">");

              w_preserve_tag({
                  bodyOnly: true,
                  id: __widgetId14
                }, out);

              out.w("</div>");
            }
          },
        {
            title: "Fetch data",
            renderBody: function renderBody(out) {
              var __widgetId16 = widget.elId("15[]");

              w_preserve_tag({
                  id: __widgetId16,
                  renderBody: function renderBody(out) {
                    app_fetch_data_tag({
                        $w: [
                          widget,
                          "#" + __widgetId16
                        ]
                      }, out);
                  }
                }, out);
            }
          },
        {
            title: "Maps",
            renderBody: function renderBody(out) {
              var __widgetId18 = widget.elId("17[]");

              w_preserve_tag({
                  id: __widgetId18,
                  renderBody: function renderBody(out) {
                    app_map_tag({
                        width: "400px",
                        height: "400px",
                        lat: "37.774929",
                        lng: "-122.419416",
                        $w: [
                          widget,
                          "#" + __widgetId18
                        ]
                      }, out);
                  }
                }, out);
            }
          },
        {
            title: "Markdown",
            renderBody: function renderBody(out) {
              out.w("<hr>\n<blockquote>\n<p>This section demonstrates Markdown in Marko</p>\n</blockquote>\n<h2 id=\"marko-features\">Marko Features</h2>\n<ul>\n<li>High performance</li>\n<li>Small</li>\n<li>Intuitive</li>\n</ul>\n<h1 id=\"h1\">H1</h1>\n<h2 id=\"h2\">H2</h2>\n<h3 id=\"h3\">H3</h3>\n<h4 id=\"h4\">H4</h4>\n<h5 id=\"h5\">H5</h5>\n<h6 id=\"h6\">H6</h6>\n<p><a href=\"http://markojs.com/\">markojs.com</a></p>\n<p><em>emphasis</em>\n<strong>strong</strong></p>\n<hr>\n");
            }
          }
      ]
    }, out);

  out.w("</div>");
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
    ],
    tags: [
      "../app-button",
      "../app-checkbox",
      "../app-notifications",
      "marko/widgets/taglib/preserve-tag",
      "../app-overlay",
      "../app-tabs",
      "../app-progress-bar",
      "../app-number-spinner",
      "../app-state-select",
      "../app-fetch-data",
      "../app-map",
      "../app-sections"
    ]
  };
