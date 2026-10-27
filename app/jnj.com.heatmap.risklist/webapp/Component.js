sap.ui.define([
    "sap/fe/core/AppComponent"
], function (AppComponent) {
    "use strict";

    return AppComponent.extend("jnj.com.heatmap.risklist.Component", {
        metadata: {
            manifest: "json",
            interfaces: ["sap.ui.core.IAsyncContentCreation"]
        },

        init: function () {
            // Pass standalone filters to FE before it initializes the filter bar.
            var query = new URLSearchParams(window.location.search || "");
            var hash = window.location.hash || "";
            var legacyQuery = new URLSearchParams(hash.startsWith("#?") ? hash.slice(2) : "");
            this._oStartupFilters = {};
            ["country", "process", "complexity", "ricefwType", "priority", "tier", "riskSeverity", "criticality", "status"].forEach(function(key) {
                var value = query.get(key) || legacyQuery.get(key);
                if (value) { this._oStartupFilters[key] = value; }
            }.bind(this));
            AppComponent.prototype.init.apply(this, arguments);
        },

        getComponentData: function () {
            var data = AppComponent.prototype.getComponentData.apply(this, arguments) || {};
            var params = Object.assign({}, data.startupParameters);
            Object.keys(this._oStartupFilters || {}).forEach(function(key) {
                // Preserve incoming launchpad navigation parameters.
                if (!params[key]) { params[key] = [this._oStartupFilters[key]]; }
            }.bind(this));
            return Object.assign({}, data, { startupParameters: params });
        },

        getStartupFilters: function () {
            return this._oStartupFilters || {};
        }
    });
});
