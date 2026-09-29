sap.ui.define([
	"sap/ui/core/mvc/ControllerExtension",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/Fragment",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (ControllerExtension, JSONModel, Fragment, MessageBox, MessageToast) {
	"use strict";

	return ControllerExtension.extend("jnj.com.heatmap.risklist.ext.controller.ListReportExt", {

		// ── Open dialog ──────────────────────────────────────────────────────
		onOpenExcelUpload: function () {
			const oView = this.base.getView();

			// Initialise / reset the upload state model
			if (!oView.getModel("excelUpload")) {
				oView.setModel(new JSONModel(), "excelUpload");
			}
			this._resetUploadModel();

			// Load fragment once, reuse afterwards
			if (!this._oUploadDialog) {
				Fragment.load({
					id: oView.getId(),
					name: "jnj.com.heatmap.risklist.ext.fragment.ExcelUploadDialog",
					controller: this
				}).then((oDialog) => {
					this._oUploadDialog = oDialog;
					oView.addDependent(oDialog);
					oDialog.open();
				});
			} else {
				this._oUploadDialog.open();
			}
		},

		// ── File selected ────────────────────────────────────────────────────
		onDialogFileChange: function (oEvent) {
			const oFileUploader = Fragment.byId(this.base.getView().getId(), "dialogFileUploader");
			const oFile = oFileUploader && oFileUploader.oFileUpload && oFileUploader.oFileUpload.files[0];
			const oModel = this.base.getView().getModel("excelUpload");

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

		// ── Upload ───────────────────────────────────────────────────────────
		onDialogUpload: function () {
			const oFileUploader = Fragment.byId(this.base.getView().getId(), "dialogFileUploader");
			const oFile = oFileUploader && oFileUploader.oFileUpload && oFileUploader.oFileUpload.files[0];

			if (!oFile) {
				MessageBox.error("Please select a file first.");
				return;
			}

			const oModel = this.base.getView().getModel("excelUpload");
			oModel.setProperty("/uploading", true);
			oModel.setProperty("/resultVisible", false);

			const oReader = new FileReader();
			oReader.onload = (oEvent) => {
				const sBase64 = oEvent.target.result.split(",")[1];
				this._callUploadAction(sBase64, oFile.name);
			};
			oReader.onerror = () => {
				oModel.setProperty("/uploading", false);
				MessageBox.error("Could not read the file. Please try again.");
			};
			oReader.readAsDataURL(oFile);
		},

		_callUploadAction: function (sBase64Content, sFileName) {
			const oODataModel = this.base.getView().getModel();
			const oUploadModel = this.base.getView().getModel("excelUpload");

			const oActionBinding = oODataModel.bindContext("/uploadExcel(...)");
			oActionBinding.setParameter("fileContent", sBase64Content);
			oActionBinding.setParameter("fileName", sFileName);

			oActionBinding.execute().then(() => {
				const oResult = oActionBinding.getBoundContext().getObject();
				oUploadModel.setProperty("/uploading", false);
				oUploadModel.setProperty("/resultVisible", true);

				if (oResult) {
					const bSuccess = oResult.status === "Completed";
					oUploadModel.setProperty("/resultType", bSuccess ? "Success" : "Error");
					oUploadModel.setProperty("/resultMessage",
						bSuccess
							? `Successfully imported ${oResult.recordCount || 0} risk(s) from "${sFileName}".`
							: `Upload failed: ${oResult.message || "Unknown error"}`
					);

					if (bSuccess) {
						// Refresh the list so new rows appear immediately
						oODataModel.refresh();
						MessageToast.show(`${oResult.recordCount || 0} risk(s) imported successfully.`);
					}
				} else {
					oUploadModel.setProperty("/resultType", "Success");
					oUploadModel.setProperty("/resultMessage", "File uploaded successfully.");
					oODataModel.refresh();
				}

				// Clear the file picker
				if (oActionBinding.getBoundContext && oResult && oResult.status === "Completed") {
					const oFileUploader = Fragment.byId(this.base.getView().getId(), "dialogFileUploader");
					if (oFileUploader) { oFileUploader.clear(); }
					oUploadModel.setProperty("/fileSelected", false);
					oUploadModel.setProperty("/selectedFileName", "");
				}

			}).catch((oError) => {
				oUploadModel.setProperty("/uploading", false);
				oUploadModel.setProperty("/resultVisible", true);
				oUploadModel.setProperty("/resultType", "Error");
				oUploadModel.setProperty("/resultMessage",
					oError && oError.message ? oError.message : "Upload failed. Please try again."
				);
			});
		},

		// ── Close dialog ─────────────────────────────────────────────────────
		onDialogClose: function () {
			if (this._oUploadDialog) {
				this._oUploadDialog.close();
			}
			this._resetUploadModel();
			const oFileUploader = Fragment.byId(this.base.getView().getId(), "dialogFileUploader");
			if (oFileUploader) { oFileUploader.clear(); }
		},

		// ── Helpers ──────────────────────────────────────────────────────────
		_resetUploadModel: function () {
			const oModel = this.base.getView().getModel("excelUpload");
			if (oModel) {
				oModel.setData({
					fileSelected: false,
					selectedFileName: "",
					uploading: false,
					resultVisible: false,
					resultMessage: "",
					resultType: "Success"
				});
			}
		}
	});
});
