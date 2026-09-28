sap.ui.define(function () {
	"use strict";

	return {
		name: "QUnit test suite for the UI5 Application: jnj.com.heatmap.dashboard",
		defaults: {
			page: "ui5://test-resources/jnj/com/heatmap/dashboard/Test.qunit.html?testsuite={suite}&test={name}",
			qunit: {
				version: 2
			},
			sinon: {
				version: 1
			},
			ui5: {
				language: "EN",
				theme: "sap_horizon"
			},
			coverage: {
				only: "jnj/com/heatmap/dashboard/",
				never: "test-resources/jnj/com/heatmap/dashboard/"
			},
			loader: {
				paths: {
					"jnj/com/heatmap/dashboard": "../"
				}
			}
		},
		tests: {
			"unit/unitTests": {
				title: "Unit tests for jnj.com.heatmap.dashboard"
			},
			"integration/opaTests": {
				title: "Integration tests for jnj.com.heatmap.dashboard"
			}
		}
	};
});
