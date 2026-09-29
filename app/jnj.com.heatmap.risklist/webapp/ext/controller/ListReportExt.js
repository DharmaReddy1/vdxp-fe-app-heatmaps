sap.ui.define([
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/Fragment",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/core/Component"
], function (JSONModel, Fragment, MessageBox, MessageToast, Component) {
	"use strict";

	// module-level dialog cache keyed by view id
	var _oDialogMap = {};

	// FE V4 custom actions are called with (oBindingContext, aSelectedContexts)
	// Strategy: find any sap.ui.core.mvc.View in the element registry that belongs
	// to our risklist app. We try several approaches in order of reliability.
	function _getView() {
		var oCore = sap.ui.getCore();

		// Approach 1: Component.registry (SAPUI5 >= 1.67)
		if (Component && Component.registry) {
			var oComponents = Component.registry.all();
			var oFound = null;
			Object.keys(oComponents).forEach(function (sId) {
				var oComp = oComponents[sId];
				if (!oFound && oComp && oComp.getMetadata) {
					var sName = oComp.getMetadata().getName();
					// Match either the FE template component or our own app component
					if (sName === "sap.fe.templates.ListReport" ||
						sName === "jnj.com.heatmap.risklist.Component") {
						oFound = oComp;
					}
				}
			});
			if (oFound) {
				// getRootControl() returns the root View of the component
				var oRoot = oFound.getRootControl ? oFound.getRootControl() : null;
				if (oRoot) { return oRoot; }
			}
		}

		// Approach 2: walk sap.ui.getCore() element registry for any View
		// whose ID contains our app namespace or "RiskList"
		var mElements = oCore.mElements || {};
		var oView = null;
		var aViewIds = Object.keys(mElements).filter(function (sId) {
			return mElements[sId] && typeof mElements[sId].getMetadata === "function" &&
				mElements[sId].getMetadata().getName() === "sap.ui.core.mvc.XMLView";
		});
		// Prefer a view whose ID references our risklist namespace
		aViewIds.forEach(function (sId) {
			if (!oView && (sId.indexOf("risklist") !== -1 || sId.indexOf("RiskList") !== -1)) {
				oView = mElements[sId];
			}
		});
		// Last resort: take the first XMLView found that is not the shell/FLP root
		if (!oView) {
			aViewIds.forEach(function (sId) {
				if (!oView &&
					sId.indexOf("appRootView") === -1 &&
					sId.indexOf("Shell") === -1 &&
					sId.indexOf("fiori2") === -1) {
					oView = mElements[sId];
				}
			});
		}
		return oView;
	}

	function _resetUploadModel(oModel) {
		oModel.setData({
			fileSelected: false,
			selectedFileName: "",
			uploading: false,
			resultVisible: false,
			resultMessage: "",
			resultType: "Success"
		});
	}

	return {

		// FE V4 calls this as: onOpenExcelUpload(oBindingContext, aSelectedContexts)
		onOpenExcelUpload: function (oBindingContext, aSelectedContexts) {
			var oView = _getView();
			if (!oView) {
				// Debug: log what views/components are registered to help diagnose
				var oCore = sap.ui.getCore();
				var mEl = oCore.mElements || {};
				var aViews = Object.keys(mEl).filter(function (k) {
					return mEl[k] && typeof mEl[k].getMetadata === "function" &&
						mEl[k].getMetadata().getName().indexOf("View") !== -1;
				});
				console.error("[ListReportExt] No view found. Registered views:", aViews);
				if (Component && Component.registry) {
					var oComps = Component.registry.all();
					console.error("[ListReportExt] Registered components:", Object.keys(oComps).map(function (k) {
						return oComps[k] && oComps[k].getMetadata ? oComps[k].getMetadata().getName() : k;
					}));
				}
				MessageBox.error("Could not determine the view context.");
				return;
			}

			// Attach excelUpload model to the view if not already there
			if (!oView.getModel("excelUpload")) {
				oView.setModel(new JSONModel(), "excelUpload");
			}
			_resetUploadModel(oView.getModel("excelUpload"));

			// Use a stable key — not the view ID which may vary
			var sViewId = oView.getId();
			var sDialogKey = "risklist-excel-upload";

			if (_oDialogMap[sDialogKey]) {
				_oDialogMap[sDialogKey].open();
				return;
			}

			Fragment.load({
				id: sDialogKey,
				name: "jnj.com.heatmap.risklist.ext.fragment.ExcelUploadDialog",
				controller: {
					onDialogFileChange: function () {
						var oFileUploader = Fragment.byId(sDialogKey, "dialogFileUploader");
						var oFile = oFileUploader && oFileUploader.oFileUpload && oFileUploader.oFileUpload.files[0];
						var oModel = oView.getModel("excelUpload");
						if (oFile) {
							oModel.setProperty("/fileSelected", true);
							oModel.setProperty("/selectedFileName", oFile.name);
							oModel.setProperty("/resultVisible", false);
						} else {
							oModel.setProperty("/fileSelected", false);
							oModel.setProperty("/selectedFileName", "");
						}
					},

					onDialogFileTypeMismatch: function () {
						MessageBox.error("Only .xlsx and .xls files are supported.");
					},

					onDialogFileSizeExceed: function () {
						MessageBox.error("File size must not exceed 10 MB.");
					},

					onDialogUpload: function () {
						var oFileUploader = Fragment.byId(sDialogKey, "dialogFileUploader");
						var oFile = oFileUploader && oFileUploader.oFileUpload && oFileUploader.oFileUpload.files[0];
						if (!oFile) {
							MessageBox.error("Please select a file first.");
							return;
						}
						var oModel = oView.getModel("excelUpload");
						oModel.setProperty("/uploading", true);
						oModel.setProperty("/resultVisible", false);

						var oReader = new FileReader();
						oReader.onload = function (oReadEvt) {
							var sBase64 = oReadEvt.target.result.split(",")[1];
							var oODataModel = oView.getModel();
							var oActionBinding = oODataModel.bindContext("/uploadExcel(...)");
							oActionBinding.setParameter("fileContent", sBase64);
							oActionBinding.setParameter("fileName", oFile.name);

							oActionBinding.execute().then(function () {
								var oResult = oActionBinding.getBoundContext().getObject();
								oModel.setProperty("/uploading", false);
								oModel.setProperty("/resultVisible", true);
								if (oResult) {
									var bSuccess = oResult.status === "Completed";
									oModel.setProperty("/resultType", bSuccess ? "Success" : "Error");
									oModel.setProperty("/resultMessage",
										bSuccess
											? "Successfully imported " + (oResult.recordCount || 0) + " risk(s) from \"" + oFile.name + "\"."
											: "Upload failed: " + (oResult.message || "Unknown error")
									);
									if (bSuccess) {
										oODataModel.refresh();
										MessageToast.show((oResult.recordCount || 0) + " risk(s) imported.");
										if (oFileUploader) { oFileUploader.clear(); }
										oModel.setProperty("/fileSelected", false);
										oModel.setProperty("/selectedFileName", "");
									}
								} else {
									oModel.setProperty("/resultType", "Success");
									oModel.setProperty("/resultMessage", "File uploaded successfully.");
									oODataModel.refresh();
								}
							}).catch(function (oError) {
								oModel.setProperty("/uploading", false);
								oModel.setProperty("/resultVisible", true);
								oModel.setProperty("/resultType", "Error");
								oModel.setProperty("/resultMessage",
									oError && oError.message ? oError.message : "Upload failed. Please try again."
								);
							});
						};
						oReader.onerror = function () {
							oModel.setProperty("/uploading", false);
							MessageBox.error("Could not read the file. Please try again.");
						};
						oReader.readAsDataURL(oFile);
					},

					onDialogClose: function () {
						var oDialog = _oDialogMap[sDialogKey];
						if (oDialog) { oDialog.close(); }
						var oModel = oView.getModel("excelUpload");
						if (oModel) { _resetUploadModel(oModel); }
						var oFileUploader = Fragment.byId(sDialogKey, "dialogFileUploader");
						if (oFileUploader) { oFileUploader.clear(); }
					}
				}
			}).then(function (oDialog) {
				_oDialogMap[sDialogKey] = oDialog;
				oView.addDependent(oDialog);
				oDialog.open();
			}).catch(function (oErr) {
				MessageBox.error("Failed to load upload dialog: " + (oErr && oErr.message ? oErr.message : String(oErr)));
			});
		}
	};
});
