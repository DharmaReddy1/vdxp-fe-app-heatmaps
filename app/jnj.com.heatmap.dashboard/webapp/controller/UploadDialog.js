sap.ui.define([
	"sap/ui/core/Fragment",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox"
], function (Fragment, JSONModel, MessageBox) {
	"use strict";

	return {
		open: function (controller) {
			var view = controller.getView();
			if (controller._uploadDialogPromise) {
				return controller._uploadDialogPromise.then(function(dialog) { dialog.open(); });
			}
			var model = new JSONModel({ fileSelected: false, selectedFileName: "", uploading: false,
				replaceExisting: false, resultVisible: false, resultMessage: "", resultType: "Success" });
			view.setModel(model, "excelUpload");
			var file;
			var dialog;
			var id = view.createId("dashboardUpload");
			var uploader = function() { return Fragment.byId(id, "dialogFileUploader"); };
			var result = function(type, message) {
				model.setProperty("/resultType", type);
				model.setProperty("/resultMessage", message);
				model.setProperty("/resultVisible", true);
			};
			var clearFile = function() {
				file = null;
				uploader().clear();
				model.setProperty("/fileSelected", false);
				model.setProperty("/selectedFileName", "");
			};
			controller._uploadDialogPromise = Fragment.load({
				id: id,
				name: "jnj.com.heatmap.dashboard.fragment.ExcelUploadDialog",
				controller: {
					onDialogFileChange: function(event) {
						file = (event.getParameter("files") || [])[0];
						model.setProperty("/fileSelected", !!file);
						model.setProperty("/selectedFileName", file ? file.name : "");
						model.setProperty("/resultVisible", false);
					},
					onDialogFileTypeMismatch: function() {
						clearFile();
						MessageBox.error("Only .xlsx and .xls files are supported.");
					},
					onDialogFileSizeExceed: function() {
						clearFile();
						MessageBox.error("File size must not exceed 10 MB.");
					},
					onDialogClose: function() {
						if (model.getProperty("/uploading")) { return; }
						dialog.close();
						clearFile();
						model.setProperty("/resultVisible", false);
						model.setProperty("/replaceExisting", false);
					},
					onDialogUpload: async function() {
						if (!file || model.getProperty("/uploading")) { return; }
						var selectedFile = file;
						var replaceExisting = !!model.getProperty("/replaceExisting");
						model.setProperty("/uploading", true);
						model.setProperty("/resultVisible", false);
						dialog.setBusy(true);
						var action;
						try {
							var content = await new Promise(function(resolve, reject) {
								var reader = new FileReader();
								reader.onload = function() { resolve(reader.result.split(",")[1]); };
								reader.onerror = function() { reject(new Error("Could not read the selected file.")); };
								reader.readAsDataURL(selectedFile);
							});
							var odata = controller.getOwnerComponent().getModel();
							action = odata.bindContext("/uploadExcel(...)");
							action.setParameter("fileContent", content);
							action.setParameter("fileName", selectedFile.name);
							action.setParameter("replaceExisting", replaceExisting);
							await action.execute();
							var batch = action.getBoundContext().getObject();
							if (!batch) { throw new Error("The upload returned no result. Refresh before trying again."); }
							var completed = batch.status === "Completed";
							var partial = batch.status === "Completed with Errors";
							result(completed ? "Success" : partial ? "Warning" : "Error",
								completed ? "Successfully imported " + (batch.recordCount || 0) + " records."
									: batch.message || "Upload failed. Please check the workbook.");
							if (completed || partial) {
								clearFile();
								odata.refresh();
								controller._loadAll();
							}
						} catch (error) {
							result("Error", error.message || "Upload failed. Please try again.");
						} finally {
							if (action) { action.destroy(); }
							model.setProperty("/uploading", false);
							dialog.setBusy(false);
						}
					}
				}
			}).then(function(loadedDialog) {
				dialog = loadedDialog;
				view.addDependent(dialog);
				dialog.open();
				return dialog;
			}).catch(function(error) {
				controller._uploadDialogPromise = null;
				MessageBox.error("Could not open upload dialog: " + error.message);
			});
			return controller._uploadDialogPromise;
		}
	};
});
