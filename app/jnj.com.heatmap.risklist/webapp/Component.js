sap.ui.define([
	"sap/fe/core/AppComponent",
	"sap/base/Log"
], function (AppComponent, Log) {
	"use strict";

	return AppComponent.extend("jnj.com.heatmap.risklist.Component", {
		metadata: {
			manifest: "json",
			interfaces: ["sap.ui.core.IAsyncContentCreation"]
		},

		/**
		 * Reads URL hash startup parameters (e.g. #?complexity=High&riskSeverity=Critical)
		 * injected by the Dashboard heatmap cell navigation, and stores them so the
		 * ListReport can apply them as initial filter values.
		 *
		 * Supported params: complexity, riskSeverity, criticality, status
		 */
		init: function () {
			// Call parent init first
			AppComponent.prototype.init.apply(this, arguments);

			try {
				// Parse hash query string: index.html#?key=value&key2=value2
				const sHash = window.location.hash || "";
				const sQuery = sHash.startsWith("#?") ? sHash.slice(2) : "";
				if (!sQuery) { return; }

				const oParams = {};
				sQuery.split("&").forEach(function (sPair) {
					const aParts = sPair.split("=");
					if (aParts.length === 2) {
						oParams[decodeURIComponent(aParts[0])] = decodeURIComponent(aParts[1]);
					}
				});

				const aAllowed = ["complexity", "riskSeverity", "criticality", "status"];
				const oStartupFilters = {};
				aAllowed.forEach(function (sKey) {
					if (oParams[sKey]) {
						oStartupFilters[sKey] = oParams[sKey];
					}
				});

				if (Object.keys(oStartupFilters).length > 0) {
					Log.info("RiskList startup filters from URL:", JSON.stringify(oStartupFilters));
					// Store in component data for the FE ListReport to consume via
					// the router's startup parameter mechanism
					this._oStartupFilters = oStartupFilters;

					// Navigate to RiskList route with filter query params
					const oRouter = this.getRouter();
					if (oRouter) {
						const oQuery = {};
						Object.keys(oStartupFilters).forEach(function (sKey) {
							// FE ListReport reads $filter-style params from the URL query
							oQuery[sKey] = oStartupFilters[sKey];
						});
						oRouter.navTo("RiskList", { "?query": oQuery }, true);
					}
				}
			} catch (oErr) {
				Log.warning("RiskList: could not parse startup URL params", oErr.message);
			}
		},

		/**
		 * Returns startup filter params parsed from the URL hash (if any).
		 * @returns {Object} map of field name to filter value
		 */
		getStartupFilters: function () {
			return this._oStartupFilters || {};
		}
	});
});
