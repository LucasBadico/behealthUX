// Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require("marko/html").t(__filename),
    marko_component = ({
    onInput: function (input) {
        var users = [];
        var pageIndex = -1;
        var usersData = input.usersData;
        if (usersData) {
            users = usersData.users;
            pageIndex = usersData.pageIndex;
        }
        this.state = {
            loading: false,
            users: users,
            pageIndex: pageIndex
        };
    },
    onMount: function () {
        this.fetchPromise = Promise.resolve();
        if (this.state.users.length === 0) {
            this.loadMore();
        }
    },
    loadMore: function () {
        this.state.loading = true;
        var state = this.state;
        this.fetchPromise = this.fetchPromise.then(function () {
            return getUsers({ pageIndex: ++state.pageIndex });
        }).then(function (usersData) {
            state.users = state.users.concat(usersData.users);
            state.loading = false;
        }).catch(function (e) {
            state.loading = false;
            console.log('Fetch failed:', e);
        });
    },
    handleLoadMoreClick: function () {
        this.loadMore();
    },
    onUpdate: function () {
        if (this.state.pageIndex > 0) {
            var tableContainer = this.getEl('tableContainer');
            tableContainer.scrollTop = tableContainer.scrollHeight;
        }
    }
}),
    marko_widgets = require("marko/widgets"),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/fullstack-challenge$1.0.0/views/components/app-fetch-data/index.marko", function() {
      return module.exports;
    }),
    users_module = require("../../services/users"),
    getUsers = users_module.getUsers,
    marko_helpers = require("marko/runtime/html/helpers"),
    marko_forEach = marko_helpers.f,
    marko_escapeXml = marko_helpers.x,
    marko_attr = marko_helpers.a,
    marko_loadTemplate = require("marko/runtime/helper-loadTemplate"),
    app_button_template = marko_loadTemplate(require.resolve("../app-button")),
    marko_loadTag = marko_helpers.t,
    app_button_tag = marko_loadTag(app_button_template),
    marko_classAttr = marko_helpers.ca;

require("purecss/build/tables.css");

function render(input, out, widget, state) {
  var data = input;

  out.w("<div class=\"app-fetch-data\"" +
    marko_attr("id", widget.id) +
    "><div class=\"table-container\"" +
    marko_attr("id", widget.elId("tableContainer")) +
    ">");

  if (state.users.length) {
    out.w("<table class=\"pure-table\"><thead><tr><td>ID</td><td>Avatar</td><td>Name</td><td>Email</td></tr></thead><tbody>");

    marko_forEach(state.users, function(user) {
      out.w("<tr><td>" +
        marko_escapeXml(user.id) +
        "</td><td><img" +
        marko_attr("src", user.avatar) +
        " width=50 height=50></td><td>" +
        marko_escapeXml(user.firstName) +
        " " +
        marko_escapeXml(user.lastName) +
        "</td><td>" +
        marko_escapeXml(user.email) +
        "</td></tr>");
    });

    out.w("</tbody></table>");
  }

  out.w("</div>");

  app_button_tag({
      label: state.users.length ? "Load more users" : "Load users",
      $w: [
        widget,
        "0[]",
        [
          "click",
          "handleLoadMoreClick",
          null
        ]
      ]
    }, out);

  out.w("<span" +
    marko_classAttr([
      state.loading ? "loading" : null
    ]) +
    "></span></div>");
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
      "../app-button"
    ]
  };
