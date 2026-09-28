sap.ui.define(["./BaseController"], function (BaseController) {
	"use strict";

	/**
	 * Main controller — not used directly by Fiori Elements.
	 * Startup URL parameter handling is done in Component.js.
	 * This controller exists as a placeholder for any future
	 * custom logic needed in the Main fallback view.
	 */
	return BaseController.extend("jnj.com.heatmap.risklist.controller.Main", {

		onInit: function () {
			// Redirect to the FE ListReport route if this view is somehow reached
			const oRouter = this.getRouter();
			if (oRouter) {
				oRouter.navTo("RiskList", {}, true);
			}
		}
	});
});
