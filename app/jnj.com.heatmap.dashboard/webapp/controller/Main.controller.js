sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageToast",
	"./UploadDialog",
	"sap/m/CustomListItem",
	"sap/m/FlexItemData",
	"sap/m/HBox",
	"sap/m/VBox",
	"sap/m/Text",
	"sap/m/Title",
	"sap/ui/core/HTML",
	"sap/ui/core/Icon",
	"sap/ui/core/Item",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/generic/app/navigation/service/NavigationHandler",
	"sap/ui/generic/app/navigation/service/SelectionVariant"
], function (BaseController, JSONModel, MessageToast, UploadDialog, CustomListItem, FlexItemData, HBox, VBox, Text, Title, HTML, Icon, Item, Filter, FilterOperator, NavigationHandler, SelectionVariant) {
	"use strict";

	// Color mapping
	var COLOR_MAP = {
		"High":     "#E53935",
		"Medium":   "#FB8C00",
		"Low":      "#FDD835",
		"Normal":   "#43A047",
		"Critical": "#7B1FA2",
		"":         "#EEEEEE"
	};
	var HEATMAP_BAND_COLORS = {
		"Critical / High": COLOR_MAP["High"],
		"Moderate": COLOR_MAP["Medium"],
		"Low": COLOR_MAP["Low"]
	};

	return BaseController.extend("jnj.com.heatmap.dashboard.controller.Main", {
		onAfterRendering: function () {
			if (!this._initialLoadDone) {
				this._initialLoadDone = true;

				this._loadRiskDistribution();
				this._loadComplexityProfile();
			}
		},

		onInit: function () {
			var h = new Date().getHours();
			var greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

			// Dashboard model
			var oDashModel = new JSONModel({
				greeting: greeting,
				lastRefreshed: "Refreshing...",
				totalRICEFs: "--",
				ricefRecordCount: 0,
				tier1Objects: "--",
				immediateAction: "--",
				mitigationRequired: "--",
				monitor: "--",
				controlled: "--",
				heatmapLoading: true,
				filtersActive: false,
				activeFilterCount: 0
			});
			this.getView().setModel(oDashModel, "dashboard");
			this.getView().setModel(new JSONModel({ items: [] }), "distribution");

			// Heatmap state
			this._heatmapMode = "ricefwType";
			this._activeFilters = {};

			// Load after render
			this.getView().attachEventOnce("afterRendering", this._loadAll, this);
		},

		_loadAll: function () {
			this._loadFilterOptions();

			this._loadKPIs();
			this._loadHeatmap();
			this._loadTopRisks();
			this._loadInvestigationQueue();
			this._loadRiskDistribution();
			this._loadComplexityProfile();
			// this._loadRiskDistribution();
		},

		// ─── KPIs ─────────────────────────────────────────────────────────────
		_loadKPIs: function () {
			var oModel = this.getOwnerComponent().getModel();
			if (!oModel) { return; }
			var oCtx = oModel.bindContext("/getDashboardKPIs(...)");
			oCtx.execute().then(function () {
				var o = oCtx.getBoundContext().getObject();
				if (!o) { return; }
				var oDash = this.getView().getModel("dashboard");
				var now = new Date();
				var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
				var pad = function(n){ return String(n).padStart(2,"0"); };
				var h = now.getHours();
				var ampm = h >= 12 ? "PM" : "AM";
				var h12 = h % 12 || 12;
				let greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
				const oIcon = this.byId("greeringIcon");
				greeting === "Good morning" ? oIcon.setSrc("sap-icon://light-mode") : greeting === "Good afternoon" ? oIcon.setSrc("sap-icon://general-leave-request") : oIcon.setSrc("sap-icon://dark-mode");
				oDash.setProperty("/greeting", greeting);	
				oDash.setProperty("/lastRefreshed",
					"Last refreshed: " + pad(now.getDate()) + " " + months[now.getMonth()] +
					" " + now.getFullYear() + ", " + pad(h12) + ":" + pad(now.getMinutes()) + " " + ampm);
				oDash.setProperty("/totalRICEFs",        o.totalRICEFs        || 0);
				oDash.setProperty("/tier1Objects",       o.tier1Objects       || 0);
				oDash.setProperty("/immediateAction",    o.immediateAction    || 0);
				oDash.setProperty("/mitigationRequired", o.mitigationRequired || 0);
				oDash.setProperty("/monitor",            o.monitor            || 0);
				oDash.setProperty("/controlled",         o.controlled         || 0);
			}.bind(this)).catch(function (e) {
				console.error("KPI load failed:", e);
				this._loadKPIsFallback();
			}.bind(this));
		},

		_loadKPIsFallback: function () {
			var oModel = this.getOwnerComponent().getModel();
			if (!oModel) { return; }
			var oList = oModel.bindList("/Risk");
			oList.requestContexts(0, 9999).then(function (aCtx) {
				var aRisks = aCtx.map(function(c){ return c.getObject(); });
				var oDash = this.getView().getModel("dashboard");
				oDash.setProperty("/totalRICEFs", aRisks.length);
				oDash.setProperty("/tier1Objects", aRisks.filter(function(r){ return r.tier === "Tier 1"; }).length);
				oDash.setProperty("/immediateAction", aRisks.filter(function(r){ return r.heatMapStatus === "Immediate action"; }).length);
				oDash.setProperty("/mitigationRequired", aRisks.filter(function(r){ return r.heatMapStatus === "Mitigation required"; }).length);
				oDash.setProperty("/monitor", aRisks.filter(function(r){ return r.heatMapStatus === "Monitor"; }).length);
				oDash.setProperty("/controlled", aRisks.filter(function(r){ return r.heatMapStatus === "Controlled"; }).length);
			}.bind(this)).catch(function(e){ console.error("Fallback KPI failed:", e); });
		},

		// ─── Heatmap ──────────────────────────────────────────────────────────
		_loadHeatmap: function () {
			var oModel = this.getOwnerComponent().getModel();
			if (!oModel) { return; }

			// Show loading state
			var oContainer = document.getElementById(this.getView().createId("heatmapTableContainer"));
			if (oContainer) {
				oContainer.innerHTML = '<div class="heatmapLoading"><div class="heatmapSpinner"></div><span>Loading heatmap data...</span></div>';
			}

			this._loadHeatmapFallback();
		},

		_loadHeatmapFallback: function () {
			var oModel = this.getOwnerComponent().getModel();
			if (!oModel) { return; }
			var oList = oModel.bindList("/Risk");
			var aFilters = this._buildODataFilters();
			if (aFilters.length) { oList.filter(aFilters); }
			oList.requestContexts(0, 9999).then(function (aCtx) {
				var aRisks = aCtx.map(function(c){ return c.getObject(); });
				// Aggregate client-side
				var agg = {};
				aRisks.forEach(function(r) {

					var ricefwType = r.ricefwType || "(blank)";
					r.priority = r.priority || "(blank)";
					var key = JSON.stringify([ricefwType, r.priority]);
					if (!agg[key]) {
						agg[key] = { ricefwType: ricefwType, priority: r.priority, count: 0 };
					}
					agg[key].count++;
				});
				this._renderHeatmapTable(Object.values(agg));
			}.bind(this)).catch(function(e){ console.error("Heatmap fallback failed:", e); });
		},

		_renderHeatmapTable: function (aData) {
			var oContainer = document.getElementById(this.getView().createId("heatmapTableContainer"));
			if (!oContainer) { return; }

			var mode = this._heatmapMode;
			var rowKey = mode === "ricefwType" ? "ricefwType" : "priority";
			var colKey = mode === "ricefwType" ? "priority" : "ricefwType";

			if (!aData || aData.length === 0) {
				oContainer.innerHTML = '<div class="heatmapNoData">' +
					'<span class="heatmapNoDataIcon">📊</span>' +
					'<div>No data matches the current filters.</div>' +
					'<div class="heatmapNoDataSub">Try adjusting filters or upload risk data.</div>' +
					'</div>';
				return;
			}
			var groupedData = {};
			aData.forEach(function(d) {
				var ricefwType = d.ricefwType;
				var key = JSON.stringify([ricefwType, d.priority]);
				if (!groupedData[key]) {
					groupedData[key] = { ricefwType: ricefwType, priority: d.priority, count: 0 };
				}
				groupedData[key].count += d.count || 0;
			});
			aData = Object.values(groupedData);

			// Collect unique bands and sort them in the workbook's business order.
			var rowSet = [], colSet = [], rowIndex = {}, colIndex = {};
			aData.forEach(function(d) {
				var r = d[rowKey] || "(blank)";
				var c = d[colKey] || "(blank)";
				if (rowIndex[r] === undefined) { rowIndex[r] = rowSet.length; rowSet.push(r); }
				if (colIndex[c] === undefined) { colIndex[c] = colSet.length; colSet.push(c); }
			});
			var ricefwTypeOrder = {};
			var priorityOrder = { "Critical": 0, "High": 1, "Medium": 2, "Low": 3 };
			var rowOrder = mode === "ricefwType" ? ricefwTypeOrder : priorityOrder;
			var colOrder = mode === "ricefwType" ? priorityOrder : ricefwTypeOrder;
			rowSet.sort(function(a, b) {
				return (rowOrder[a] === undefined ? 99 : rowOrder[a]) - (rowOrder[b] === undefined ? 99 : rowOrder[b]) || a.localeCompare(b, undefined, { numeric: true });
			});
			colSet.sort(function(a, b) {
				return (colOrder[a] === undefined ? 99 : colOrder[a]) - (colOrder[b] === undefined ? 99 : colOrder[b]) || a.localeCompare(b, undefined, { numeric: true });
			});

			// Build lookup: row -> col -> cell data
			var lookup = {};
			aData.forEach(function(d) {
				var r = d[rowKey] || "(blank)";
				var c = d[colKey] || "(blank)";
				if (!lookup[r]) { lookup[r] = {}; }
				lookup[r][c] = {
					count: d.count || 0,
					ricefwType: d.ricefwType,
					priority: d.priority
				};
			});

			var getDominant = function(cell) {
				return cell && cell.count > 0 ? cell.priority : null;
			};

			// Build tooltip text
			var getTooltip = function(cell, row, col) {
				if (!cell || cell.count === 0) { return row + " × " + col + ": No RICEFWs"; }
				return row + " × " + col + " | RICEFWs: " + cell.count;
			};

			// Compute max count for intensity scaling
			var maxCount = 1;
			aData.forEach(function(d){ if ((d.count || 0) > maxCount) { maxCount = d.count; } });

			// Build HTML table
			var colHeaderLabel = mode === "ricefwType" ? "RICEFW Type \\ Priority" : "Priority \\ RICEFW Type";
			var html = '<div class="heatmapScrollWrapper"><table class="heatmapTable">' +
				'<thead><tr><th class="heatmapCornerHeader">' + colHeaderLabel + '</th>';
			colSet.forEach(function(c) {
				var short = c.length > 18 ? c.substring(0, 16) + "…" : c;
				html += '<th class="heatmapColHeader" title="' + _escapeHtml(c) + '">' + _escapeHtml(short) + '</th>';
			});
			html += '</tr></thead><tbody>';

			var self = this;
			rowSet.forEach(function(r) {
				html += '<tr><td class="heatmapRowLabel" title="' + _escapeHtml(r) + '">' + _escapeHtml(r) + '</td>';
				colSet.forEach(function(c) {
					var cell = (lookup[r] && lookup[r][c]) ? lookup[r][c] : null;
					var count = cell ? cell.count : 0;
					var dominant = getDominant(cell);
					var color = dominant ? (COLOR_MAP[dominant] || "#3B82F6") : "#F0F2F5";
					var textColor = dominant === "Low" ? "#333" : dominant ? "#fff" : "#9CA3AF";
					var intensity = count > 0 ? Math.max(0.55, Math.min(1, 0.55 + (count / maxCount) * 0.45)) : 1;
					var tooltip = _escapeHtml(getTooltip(cell, r, c));
					var clickable = count > 0 ? ' data-row="' + _escapeHtml(r) + '" data-col="' + _escapeHtml(c) + '" data-mode="' + mode + '"' : '';
					var cellClass = "heatmapCell" + (count > 0 ? " heatmapCellActive" : " heatmapCellEmpty");
					html += '<td class="' + cellClass + '" style="background:' + color + ';opacity:' + intensity +
						';color:' + textColor + ';" title="' + tooltip + '"' + clickable + '>';
					if (count > 0) {
						html += '<span class="heatmapCellCount">' + count + '</span>';

					} else {
						html += '<span class="heatmapCellDash">—</span>';
					}
					html += '</td>';
				});
				html += '</tr>';
			});

			html += '</tbody></table></div>';
			oContainer.innerHTML = html;

			// Attach click handlers for drill-down
			var aCells = oContainer.querySelectorAll(".heatmapCellActive");
			aCells.forEach(function(el) {
				el.addEventListener("click", function() {
					var row = el.getAttribute("data-row");
					var col = el.getAttribute("data-col");
					var cellMode = el.getAttribute("data-mode");
					self._onHeatmapCellClick(row, col, cellMode);
				});
			});
		},

		_onHeatmapCellClick: function (sRow, sCol, sMode) {
			var ricefwType = sMode === "ricefwType" ? sRow : sCol;
			var priority = sMode === "ricefwType" ? sCol : sRow;
			this._activeFilters.ricefwType = ricefwType === "(blank)" ? null : ricefwType;
			delete this._activeFilters.riskCategory;
			this._activeFilters.priority = priority === "(blank)" ? null : priority;

			var oRiskBand = this.byId("riskCategoryFilter");
			var oReadinessBand = this.byId("priorityFilter");
			if (oRiskBand) { oRiskBand.setSelectedKey(ricefwType); }
			if (oReadinessBand) { oReadinessBand.setSelectedKey(priority); }

			this._updateFilterBadge();
			this._loadHeatmap();
			this._loadTopRisks();
			this._loadInvestigationQueue();
			this._loadRiskDistribution();
			this._loadComplexityProfile();
			MessageToast.show("Filtered: " + ricefwType + " type / " + priority + " priority");
		},

		onHeatmapToggle: function (oEvent) {
			this._heatmapMode = oEvent.getParameter("item").getKey();
			this._loadHeatmap();
		},

		// ─── Top Risk Areas ───────────────────────────────────────────────────
		_loadTopRisks: function () {
			var oModel = this.getOwnerComponent().getModel();
			if (!oModel) { return; }
			var requestId = this._topRisksRequestId = (this._topRisksRequestId || 0) + 1;
			// Keep this panel independent of dashboard filters: show open Critical records only.
			var oList = oModel.bindList("/Risk");
			oList.filter([new Filter("criticality", FilterOperator.EQ, "Critical")]);
			oList.requestContexts(0, 9999).then(function (aCtx) {
				if (requestId !== this._topRisksRequestId) { return; }
				var aRisks = aCtx.map(function(c) { return c.getObject(); }).filter(function(risk) {
					return risk.criticality === "Critical" && risk.status !== "Closed";
				});
				aRisks.sort(function(a, b) {
					return String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || String(a.ID).localeCompare(String(b.ID));
				});
				this._renderTopRiskList(aRisks.slice(0, 5));
			}.bind(this)).catch(function(e) {
				if (requestId !== this._topRisksRequestId) { return; }
				console.error("TopRisks load failed:", e);
				this._renderTopRiskList([]);
			}.bind(this)).finally(function() { oList.destroy(); });
		},

		_renderTopRiskList: function (aRisks) {
			var oList = this.byId("topRiskList");
			if (!oList) { return; }
			oList.removeAllItems();
			if (!aRisks || aRisks.length === 0) {
				var oEmpty = new CustomListItem();
				oEmpty.addContent(new Text({ text: "No critical risks available", wrapping: false }).addStyleClass("sapUiSmallMargin"));
				oList.addItem(oEmpty);
				return;
			}
			aRisks.forEach(function(risk, idx) {
				var oItem = new CustomListItem({ type: "Navigation", press: this._navigateToRisk.bind(this, risk) });
				var oRow = new HBox({ alignItems: "Center", justifyContent: "SpaceBetween" }).addStyleClass("topRiskRow");
				// Left: rank + title + subtitle
				var oLeft = new HBox({
					alignItems: "Center",
					layoutData: new FlexItemData({ growFactor: 1, shrinkFactor: 1, baseSize: "0%", minWidth: "0" })
				}).addStyleClass("topRiskContent");
				var oRank = new Text({ text: String(idx + 1), layoutData: new FlexItemData({ shrinkFactor: 0 }) }).addStyleClass("riskRank rank" + (idx + 1));
				var oInfo = new VBox({
					layoutData: new FlexItemData({ growFactor: 1, shrinkFactor: 1, baseSize: "0%", minWidth: "0" })
				}).addStyleClass("topRiskText");
				var sTitle = (risk.riskTitle || "Unknown Risk") + (risk.country ? " \u2013 " + risk.country : "");
				oInfo.addItem(new Text({ text: sTitle, tooltip: sTitle, width: "100%", wrapping: false }).addStyleClass("riskTitle"));
				var sSubtitle = [risk.process || risk.description, risk.ricefwType].filter(Boolean).join(" \u00b7 ");
				oInfo.addItem(new Text({ text: sSubtitle, tooltip: sSubtitle, width: "100%", wrapping: false }).addStyleClass("riskSubtitle"));
				oLeft.addItem(oRank);
				oLeft.addItem(oInfo);
				// Right: criticality badge
				var oBadge = new Text({
					text: risk.criticality || "",
					wrapping: false,
					layoutData: new FlexItemData({ growFactor: 0, shrinkFactor: 0 })
				})
					.addStyleClass("critBadge critBadge" + (risk.criticality || ""));
				oRow.addItem(oLeft);
				oRow.addItem(oBadge);
				oItem.addContent(oRow);
				oList.addItem(oItem);
			}.bind(this));
		},

		// ─── Investigation Queue ──────────────────────────────────────────────
		_loadInvestigationQueue: function () {
			var oModel = this.getOwnerComponent().getModel();
			if (!oModel) { return; }
			var requestId = this._ricefRequestId = (this._ricefRequestId || 0) + 1;

			var oList = oModel.bindList(
				"/Risk",
				null,
				null,
				null,
				{
					$orderby: "riskId asc,ID asc"
				}
			);

			oList.filter(this._buildODataFilters());
			oList.requestContexts(0, 9999).then(function (aCtx) {
				if (requestId !== this._ricefRequestId) { return; }

				var aRisks = aCtx.map(function(c) {
					return c.getObject();
				});

				this._ricefRecords = aRisks;
				this._filterRicefRecords();

			}.bind(this)).catch(function(e) {
				if (requestId !== this._ricefRequestId) { return; }

				console.error("RICEF list load failed:", e);
				this._ricefRecords = [];
				this._filterRicefRecords();

			}.bind(this)).finally(function() { oList.destroy(); });
		},

		onRicefSearch: function (oEvent) {
			this._ricefSearch = oEvent.getSource().getValue();
			this._filterRicefRecords();
		},

		_filterRicefRecords: function () {
			var query = (this._ricefSearch || "").trim().toLowerCase();
			var records = (this._ricefRecords || []).filter(function (risk) {
				return !query || [risk.ricefw, risk.riskId, risk.ricefId, risk.wricefName, risk.riskTitle, risk.processFunction, risk.process, risk.scrumTeam, risk.release]
					.join(" ").toLowerCase().includes(query);
			});
			this.getView().getModel("dashboard").setProperty("/ricefRecordCount", records.length);
			this._renderInvestigationQueue(records.slice(0, 5));
		},

		_renderInvestigationQueue: function (aRisks) {
			var oRecordsModel = this.getView().getModel("ricefs");
			if (!oRecordsModel) {
				oRecordsModel = new JSONModel({ records: [] });
				this.getView().setModel(oRecordsModel, "ricefs");
			}
			oRecordsModel.setProperty("/records", (aRisks || []).map(function (risk, index) {
				return {
					ID: risk.ID,
					IsActiveEntity: risk.IsActiveEntity !== false,
					rank: String(index + 1),
					criticality: risk.criticality || "",
					title: [risk.ricefw || risk.riskId, risk.wricefName || risk.riskTitle].filter(Boolean).join(" – "),
					description: [risk.processFunction || risk.process, risk.ricefwType, risk.release || risk.country].filter(Boolean).join(" – "),
					readinessBand: risk.readinessBand || ""
				};
			}));
		},

		// ─── Risk Distribution Donut ──────────────────────────────────────────
				_loadRiskDistribution: function () {

					var oModel = this.getOwnerComponent().getModel();

					if (!oModel) {
						return;
					}

					var oList = oModel.bindList("/Risk");
					var aFilters = this._buildODataFilters();

					if (aFilters.length) {
						oList.filter(aFilters);
					}

					oList.requestContexts(0, 9999)
						.then(function (aCtx) {

							var aRisks = aCtx.map(function (c) {
								return c.getObject();
							});

							var agg = {};

							aRisks.forEach(function (r) {
								var crit = r.criticality || "Unknown";
								agg[crit] = (agg[crit] || 0) + 1;
							});

							var order = {
								Critical: 0,
								High: 1,
								Medium: 2,
								Low: 3,
								Normal: 4
							};

							var aData = Object.keys(agg).map(function (k) {
								return {
									criticality: k,
									count: agg[k]
								};
							});

							aData.sort(function (a, b) {
									return (order[a.criticality] ?? 99) -
										(order[b.criticality] ?? 99);
							});

							this._distributionData = aData;
							this._donutPropertiesApplied = false;
							this.getView().getModel("distribution").setProperty("/items", aData);

							this._renderDonutLegendFromData(aData);

							this.onDonutRenderComplete();

						}.bind(this))
						.catch(function (e) {
							console.error("Distribution load failed:", e);
						});
				},

				onDonutRenderComplete: function () {

			var oViz = this.byId("donutViz");

				if (!oViz) { return; }

				if (!this._donutPropertiesApplied) {
					this._donutPropertiesApplied = true;
					oViz.setVizProperties({
				tooltip: {
					visible: true
				},
				title: {
					visible: false
				},
				plotArea: {
					colorPalette: (this._distributionData || []).map(function (item) {
						return COLOR_MAP[item.criticality] || "#9CA3AF";
					}),
					dataLabel: {
						visible: false
					}
				},
				legend: {
					visible: false
				}
				});
			}

			var aData = this._distributionData || [];
			var total = aData.reduce(function(sum, item) { return sum + (item.count || 0); }, 0);
			var oChartDom = oViz.getDomRef();
			if (!oChartDom) { return; }
			Array.prototype.forEach.call(oChartDom.querySelectorAll("svg path[fill]"), function(oSlice) {
				var sFill = (oSlice.getAttribute("fill") || "").toLowerCase();
				var oDatum = aData.find(function(item) {
					var sColor = COLOR_MAP[item.criticality];
					return sColor && sColor.toLowerCase() === sFill;
				});
				if (!oDatum) { return; }

				var oTitle = oSlice.querySelector("title");
				if (!oTitle) {
					oTitle = document.createElementNS("http://www.w3.org/2000/svg", "title");
					oSlice.insertBefore(oTitle, oSlice.firstChild);
				}
				var percentage = total > 0 ? Math.round(oDatum.count / total * 100) : 0;
				oTitle.textContent = oDatum.criticality + ": " + oDatum.count + " (" + percentage + "%)";
			});
		},

		_renderDonutLegend: function () {
			var oModel = this.getOwnerComponent().getModel();
			if (!oModel) { return; }
			var oList = oModel.bindList("/RiskDistribution");
			oList.requestContexts(0, 10).then(function (aCtx) {
				var aData = aCtx.map(function(c){ return c.getObject(); });
				this._renderDonutLegendFromData(aData);
			}.bind(this)).catch(function(e){ console.error("Donut legend failed:", e); });
		},

		_renderDonutLegendFromData: function (aData) {
			var oLegend = this.byId("donutLegend");
			if (!oLegend) { return; }
			oLegend.removeAllItems();
			var total = aData.reduce(function(s, d){ return s + (d.count || 0); }, 0);
			aData.forEach(function(d) {
				var pct = total > 0 ? Math.round(d.count / total * 100) : 0;
				var oRow = new HBox({ alignItems: "Center", justifyContent: "SpaceBetween" }).addStyleClass("donutLegendRow");
				var oLeft = new HBox({ alignItems: "Center" });
				var oDot = new Icon({ src: "sap-icon://circle-task-2" });
				oDot.addStyleClass("donutDot donutDot" + (d.criticality || ""));
				oLeft.addItem(oDot);
				oLeft.addItem(new Text({ text: d.criticality || "Unknown" }).addStyleClass("donutLegendLabel"));
				var oRight = new HBox({ alignItems: "Center" });
				oRight.addItem(new Text({ text: String(d.count) }).addStyleClass("donutLegendCount"));
				oRight.addItem(new Text({ text: " (" + pct + "%)" }).addStyleClass("donutLegendPct"));
				oRow.addItem(oLeft);
				oRow.addItem(oRight);
				oLegend.addItem(oRow);
			}.bind(this));
		},

		// ─── Complexity Profile ───────────────────────────────────────────────
		_loadComplexityProfile: function () {
			var oModel = this.getOwnerComponent().getModel();
			if (!oModel) { return; }
			var requestId = this._complexityRequestId = (this._complexityRequestId || 0) + 1;
			// Filter source records before counting; the summary view has no type/priority fields.
			var oList = oModel.bindList("/Risk");
			oList.filter(this._buildODataFilters());
			oList.requestContexts(0, 9999).then(function (aCtx) {
				if (requestId !== this._complexityRequestId) { return; }
				var counts = new Map();
				var order = { High: 1, Medium: 2, Low: 3 };
				aCtx.forEach(function(context) {
					var complexity = context.getObject().complexity || "";
					counts.set(complexity, (counts.get(complexity) || 0) + 1);
				});
				var aData = Array.from(counts, function(entry) {
					return { complexity: entry[0], count: entry[1], sortOrder: order[entry[0]] || 4 };
				});
				this._renderComplexityBars(aData);
			}.bind(this)).catch(function(e) {
				if (requestId !== this._complexityRequestId) { return; }
				console.error("Complexity profile failed:", e);
				this._renderComplexityBars([]);
			}.bind(this)).finally(function() { oList.destroy(); });
		},

		_renderComplexityBars: function (aData) {
			var oBars = this.byId("complexityBars");
			if (!oBars) { return; }
			oBars.destroyItems();
			var max = aData.reduce(function(m, d){ return Math.max(m, d.count || 0); }, 1);
			var colorOrder = { "High": COLOR_MAP["High"], "Medium": COLOR_MAP["Medium"], "Low": COLOR_MAP["Low"], "Normal": COLOR_MAP["Normal"] };
			// Sort by defined order
			aData.sort(function(a, b){ return (a.sortOrder || 99) - (b.sortOrder || 99); });
			aData.forEach(function(d) {
				var pct = Math.round((d.count || 0) / max * 100);
				var color = colorOrder[d.complexity] || "#90CAF9";
				var oRow = new HBox({ alignItems: "Center" }).addStyleClass("complexityRow");
				var oLabel = new Text({ text: d.complexity || "Unknown", wrapping: false }).addStyleClass("complexityLabel");
				var oBarWrap = new HBox({ renderType: "Bare" }).addStyleClass("complexityBarWrap");
				// HTML has no width property; size its root element explicitly.
				var oBarContainer = new HTML({ content:
					'<div class="complexityBarContent"><div class="complexityBar" style="width:' + pct + '%;background:' + color + ';"></div></div>'
				});
				oBarWrap.addItem(oBarContainer);
				var oCount = new Text({ text: String(d.count || 0) }).addStyleClass("complexityCount");
				oRow.addItem(oLabel);
				oRow.addItem(oBarWrap);
				oRow.addItem(oCount);
				oBars.addItem(oRow);
			}.bind(this));
		},

		// ─── Filter Options ───────────────────────────────────────────────────
		_loadFilterOptions: function () {
			var oModel = this.getOwnerComponent().getModel();
			if (!oModel) { return; }
			oModel.bindList("/Risk", undefined, undefined, undefined, { $select: "ricefwType,priority" }).requestContexts(0, 9999).then(function(contexts) {
                ["ricefwType", "priority"].forEach(function(key) {
                    var values = Array.from(new Set(contexts.map(function(c) { return c.getObject()[key]; }).filter(Boolean))).sort();
                    this._populateSelect(key === "ricefwType" ? "riskCategoryFilter" : "priorityFilter", values, key === "ricefwType" ? "All RICEFW Types" : "All Priorities");
                }.bind(this));
            }.bind(this)).catch(function(e) { console.error("Type and priority options failed:", e); });
            var oCtx = oModel.bindContext("/getFilterOptions(...)");
			oCtx.execute().then(function () {
				var o = oCtx.getBoundContext().getObject();
				if (!o) { return; }
				this._populateSelect("countryFilter",      o.countries || [],      "All Releases");
				this._populateSelect("processFilter",      o.processes || [],      "All Process Functions");

			}.bind(this)).catch(function(e){ console.error("Filter options failed:", e); });
		},

		_populateSelect: function (sId, aValues, sAllText) {
			var oSelect = this.byId(sId);
			if (!oSelect) { return; }
			oSelect.removeAllItems();
			var oAllItem = new Item({
				key: "",
				text: sAllText
			});
			oSelect.addItem(oAllItem);
			aValues.forEach(function(v) {
				if (v) {
					oSelect.addItem(
						new Item({
							key: v,
							text: v
						})
					);
				}
			});
			oSelect.setSelectedItem(oAllItem);
		},

		// ─── Filter handling ──────────────────────────────────────────────────
		onFilterChange: function () {
			this._activeFilters = {
				country:      this.byId("countryFilter")      ? this.byId("countryFilter").getSelectedKey()      : "",
				process:      this.byId("processFilter")      ? this.byId("processFilter").getSelectedKey()      : "",
				complexity:   this.byId("complexityFilter")   ? this.byId("complexityFilter").getSelectedKey()   : "",
				ricefwType: this.byId("riskCategoryFilter") ? this.byId("riskCategoryFilter").getSelectedKey() : "",				priority: this.byId("priorityFilter") ? this.byId("priorityFilter").getSelectedKey() : ""
			};
			this._updateFilterBadge();
			this._loadHeatmap();
			this._loadTopRisks();
			this._loadRiskDistribution();
			this._loadComplexityProfile();
		},

		_updateFilterBadge: function () {
			var f = this._activeFilters || {};
			var count = Object.values(f).filter(function(v){ return !!v; }).length;
			var oDash = this.getView().getModel("dashboard");
			if (oDash) {
				oDash.setProperty("/activeFilterCount", count);
				oDash.setProperty("/filtersActive", count > 0);
			}
		},

		_buildODataFilters: function () {
			var aFilters = [];
			var f = this._activeFilters || {};
			if (f.country)      { aFilters.push(new Filter("country",      FilterOperator.EQ, f.country)); }
			if (f.process)      { aFilters.push(new Filter("process",      FilterOperator.EQ, f.process)); }
			if (f.complexity)   { aFilters.push(new Filter("complexity",   FilterOperator.EQ, f.complexity)); }
			["ricefwType", "priority"].forEach(function(key) {
				if (f[key] !== undefined && f[key] !== "") { aFilters.push(new Filter(key, FilterOperator.EQ, f[key])); }
			});
			return aFilters;
		},

		onResetFilters: function () {
			["countryFilter","processFilter","complexityFilter","riskCategoryFilter","priorityFilter"].forEach(function(sId) {
				var oCtrl = this.byId(sId);
				if (oCtrl) { oCtrl.setSelectedKey(""); }
			}.bind(this));
			this._activeFilters = {};
			this._updateFilterBadge();
			this._loadHeatmap();
			this._loadTopRisks();
			this._loadInvestigationQueue();
			this._loadRiskDistribution();
			this._loadComplexityProfile();
			MessageToast.show("Filters cleared");
		},

		// ─── Navigation ───────────────────────────────────────────────────────
		onNavigateToUpload: function () {
			UploadDialog.open(this);
		},

		onRefresh: function () {
			this._loadAll();
			MessageToast.show("Dashboard refreshed");
		},

		onRicefPress: function (oEvent) {
			var oContext = oEvent.getSource().getBindingContext("ricefs");
			var record = oContext && oContext.getObject();
			this._navigateToRisk(record);
		},

		_navigateToRisk: function (record) {
			if (!record || !record.ID) {
				MessageToast.show("This RICEF could not be opened. Refresh the dashboard and try again.");
				return;
			}
			var route = "Risk(ID=" + encodeURIComponent(record.ID) + ",IsActiveEntity=" + (record.IsActiveEntity !== false) + ")";
			var oCrossAppNav = sap.ushell && sap.ushell.Container &&
				sap.ushell.Container.getService("CrossApplicationNavigation");
			if (oCrossAppNav) {
				oCrossAppNav.toExternal({
					target: { semanticObject: "RiskList", action: "manage" },
					appSpecificRoute: "/" + route
				});
			} else {
				window.location.href = "/jnj.com.heatmap.risklist/webapp/index.html#/" + route;
			}
		},

		onViewAllRicefRecords: function () {
			var params = {};
			var filters = this._activeFilters || {};
			["country", "process", "complexity", "ricefwType", "priority", "tier"].forEach(function(key) {
				if (filters[key] !== undefined && filters[key] !== "") {
					params[key] = filters[key] === null ? "" : filters[key];
				}
			});
			var oCrossAppNav = sap.ushell && sap.ushell.Container &&
				sap.ushell.Container.getService("CrossApplicationNavigation");
			if (oCrossAppNav) {
				// Carry filter conditions in xAppState so FE applies them on inbound navigation.
				var selectionVariant = new SelectionVariant();
				Object.keys(params).forEach(function(key) {
					selectionVariant.addSelectOption(key, "I", "EQ", params[key]);
				});
				if (!this._riskNavigationHandler) {
					this._riskNavigationHandler = new NavigationHandler(this);
				}
				this._riskNavigationHandler.navigate("RiskList", "manage", selectionVariant.toJSONString(), undefined, function(error) {
					console.error("Risk list navigation failed:", error);
					MessageToast.show("Could not open the filtered risk list. Please try again.");
				});
			} else {
				var query = new URLSearchParams(params).toString();
				window.location.href = "/jnj.com.heatmap.risklist/webapp/index.html" + (query ? "?" + query : "");
			}
		},

		onViewAllCriticalRisks: function () {
			var oCrossAppNav = sap.ushell && sap.ushell.Container &&
				sap.ushell.Container.getService("CrossApplicationNavigation");
			if (oCrossAppNav) {
				oCrossAppNav.toExternal({
					target: { semanticObject: "RiskList", action: "manage" },
					params: { criticality: "Critical" }
				});
			} else {
				window.location.href = "/jnj.com.heatmap.risklist/webapp/index.html?criticality=Critical";
			}
		},

		onViewAllRisks: function () {
			var oCrossAppNav = sap.ushell && sap.ushell.Container &&
				sap.ushell.Container.getService("CrossApplicationNavigation");
			if (oCrossAppNav) {
				oCrossAppNav.toExternal({
					target: { semanticObject: "RiskList", action: "manage" }
				});
			} else {
				window.location.href = "/jnj.com.heatmap.risklist/webapp/index.html";
			}
		}
	});

	// ─── Private helpers (module-level) ───────────────────────────────────────
	function _escapeHtml(str) {
		if (!str) { return ""; }
		return String(str)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}
});
