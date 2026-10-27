sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "sap/m/MessageBox"
], function (ControllerExtension, MessageBox) {
    "use strict";

    return ControllerExtension.extend("jnj.com.heatmap.risklist.ext.controller.StartupFilters", {
        override: {
            routing: {
                onAfterBinding: function () {
                    if (this._startupFiltersApplied) { return; }
                    var component = this.base.getAppComponent();
                    var filters = component.getStartupFilters();
                    var keys = Object.keys(filters);
                    if (!keys.length) { return; }
                    this._startupFiltersApplied = true;
                    var api = this.base.getExtensionAPI();
                    // URL parameters alone are not an FE navigation context in standalone mode.
                    // Wait for all filter conditions before triggering the filtered table request.
                    return Promise.all(keys.map(function (key) {
                        return api.setFilterValues(key, "EQ", filters[key]);
                    })).then(function () {
                        return api.refresh();
                    }).catch(function (error) {
                        console.error("Could not apply incoming risk filters:", error);
                        MessageBox.error("Could not apply the dashboard filters. Please reload the page.");
                    });
                }
            }
        }
    });
});
