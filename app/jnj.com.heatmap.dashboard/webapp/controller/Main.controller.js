sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageToast",
	"sap/m/CustomListItem",
	"sap/m/HBox",
	"sap/m/VBox",
	"sap/m/Text",
	"sap/m/Title",
	"sap/ui/core/HTML",
	"sap/ui/core/Icon",
	"sap/ui/core/Item",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, MessageToast, CustomListItem, HBox, VBox, Text, Title, HTML, Icon, Item, Filter, FilterOperator) {
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
				totalRisks: "--",
				highSeverity: "--",
				openIncidents: "--",
				onTrackPct: "--",
				totalTrend: 0,
				highTrend: 0,
				openTrend: 0,
				onTrackTrend: 0,
				heatmapLoading: true,
				filtersActive: false,
				activeFilterCount: 0
			});
			this.getView().setModel(oDashModel, "dashboard");

			// Heatmap state
			this._heatmapMode = "process"; // "process" or "country"
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
			// this._loadComplexityProfile();
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
				oDash.setProperty("/totalRisks",    o.totalRisks    || 0);
				oDash.setProperty("/highSeverity",  o.highSeverity  || 0);
				oDash.setProperty("/openIncidents", o.openIncidents || 0);
				oDash.setProperty("/onTrackPct",    o.onTrackPct    || 0);
				oDash.setProperty("/totalTrend",    o.totalTrend    || 0);
				oDash.setProperty("/highTrend",     o.highTrend     || 0);
				oDash.setProperty("/openTrend",     o.openTrend     || 0);
				oDash.setProperty("/onTrackTrend",  o.onTrackTrend  || 0);
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
				oDash.setProperty("/totalRisks",    aRisks.length);
				oDash.setProperty("/highSeverity",  aRisks.filter(function(r){ return r.criticality === "High"; }).length);
				oDash.setProperty("/openIncidents", aRisks.filter(function(r){ return r.status === "Open"; }).length);
				var resolved = aRisks.filter(function(r){ return r.status === "Mitigated" || r.status === "Closed"; }).length;
				oDash.setProperty("/onTrackPct", aRisks.length > 0 ? Math.round(resolved / aRisks.length * 100) : 0);
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

			var oList = oModel.bindList("/HeatmapSummary");
			// Apply active filters — OData $filter works on the projection view
			var aFilters = this._buildODataFilters();
			if (aFilters.length) { oList.filter(aFilters); }
			oList.requestContexts(0, 9999).then(function (aCtx) {
				var aData = aCtx.map(function(c){ return c.getObject(); });
				this._renderHeatmapTable(aData);
			}.bind(this)).catch(function(e){
				console.error("Heatmap load failed:", e);
				// Fallback: load all risks and aggregate client-side
				this._loadHeatmapFallback();
			}.bind(this));
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
					var country = r.country || "(blank)";
					var process = r.process || "(blank)";
					var key = country + "|||" + process;
					if (!agg[key]) {
						agg[key] = { country: country, process: process, count: 0,
							highCount: 0, mediumCount: 0, lowCount: 0, normalCount: 0, criticalCount: 0 };
					}
					agg[key].count++;
					if (r.criticality === "High")     { agg[key].highCount++; }
					if (r.criticality === "Medium")   { agg[key].mediumCount++; }
					if (r.criticality === "Low")      { agg[key].lowCount++; }
					if (r.criticality === "Normal")   { agg[key].normalCount++; }
					if (r.criticality === "Critical") { agg[key].criticalCount++; }
				});
				this._renderHeatmapTable(Object.values(agg));
			}.bind(this)).catch(function(e){ console.error("Heatmap fallback failed:", e); });
		},

		_renderHeatmapTable: function (aData) {
			var oContainer = document.getElementById(this.getView().createId("heatmapTableContainer"));
			if (!oContainer) { return; }

			var mode = this._heatmapMode;
			var rowKey = (mode === "process") ? "country" : "process";
			var colKey = (mode === "process") ? "process" : "country";

			if (!aData || aData.length === 0) {
				oContainer.innerHTML = '<div class="heatmapNoData">' +
					'<span class="heatmapNoDataIcon">📊</span>' +
					'<div>No data matches the current filters.</div>' +
					'<div class="heatmapNoDataSub">Try adjusting filters or upload risk data.</div>' +
					'</div>';
				return;
			}

			// Collect unique rows/cols — sort alphabetically
			var rowSet = [], colSet = [], rowIndex = {}, colIndex = {};
			aData.forEach(function(d) {
				var r = d[rowKey] || "(blank)";
				var c = d[colKey] || "(blank)";
				if (rowIndex[r] === undefined) { rowIndex[r] = rowSet.length; rowSet.push(r); }
				if (colIndex[c] === undefined) { colIndex[c] = colSet.length; colSet.push(c); }
			});
			rowSet.sort(); colSet.sort();

			// Build lookup: row -> col -> cell data
			var lookup = {};
			aData.forEach(function(d) {
				var r = d[rowKey] || "(blank)";
				var c = d[colKey] || "(blank)";
				if (!lookup[r]) { lookup[r] = {}; }
				lookup[r][c] = {
					count:        d.count        || 0,
					highCount:    d.highCount    || 0,
					mediumCount:  d.mediumCount  || 0,
					lowCount:     d.lowCount     || 0,
					normalCount:  d.normalCount  || 0,
					criticalCount:d.criticalCount|| 0
				};
			});

			// Determine dominant criticality color
			var getDominant = function(cell) {
				const criticalityFilter = sap.ui.getCore().getElementById("application-RiskHeatmap-display-component---main--criticalityFilter").getSelectedKey();
				if (!cell || cell.count === 0) { return null; }
				if (criticalityFilter === "") {
					return "";
				}
				if ((cell.criticalCount || 0) > 0) { return "Critical"; }
				if (cell.highCount   > 0) { return "High"; }
				if (cell.mediumCount > 0) { return "Medium"; }
				if (cell.lowCount    > 0) { return "Low"; }
				if (cell.normalCount > 0) { return "Normal"; }
				return null;
			};

			// Build tooltip text
			var getTooltip = function(cell, row, col) {
				if (!cell || cell.count === 0) { return row + " × " + col + ": No risks"; }
				var parts = [row + " × " + col, "Total: " + cell.count];
				if (cell.criticalCount) { parts.push("Critical: " + cell.criticalCount); }
				if (cell.highCount)     { parts.push("High: "     + cell.highCount); }
				if (cell.mediumCount)   { parts.push("Medium: "   + cell.mediumCount); }
				if (cell.lowCount)      { parts.push("Low: "      + cell.lowCount); }
				if (cell.normalCount)   { parts.push("Normal: "   + cell.normalCount); }
				return parts.join(" | ");
			};

			// Compute max count for intensity scaling
			var maxCount = 1;
			aData.forEach(function(d){ if ((d.count || 0) > maxCount) { maxCount = d.count; } });

			// Build HTML table
			var colHeaderLabel = (mode === "process") ? "Country \\ Process" : "Process \\ Country";
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
					var dominant = this.getDominant(cell);
					var color = dominant ? COLOR_MAP[dominant] : "#ebcccc";
					var textColor = (color === COLOR_MAP["Low"]) ? "#5D4037" : (dominant ? "#fff" : "#9CA3AF");
					var intensity = count > 0 ? Math.max(0.55, Math.min(1, 0.55 + (count / maxCount) * 0.45)) : 1;
					var tooltip = _escapeHtml(getTooltip(cell, r, c));
					var clickable = count > 0 ? ' data-row="' + _escapeHtml(r) + '" data-col="' + _escapeHtml(c) + '" data-mode="' + mode + '"' : '';
					var cellClass = "heatmapCell" + (count > 0 ? " heatmapCellActive" : " heatmapCellEmpty");
					html += '<td class="' + cellClass + '" style="background:' + color + ';opacity:' + intensity +
						';color:' + textColor + ';" title="' + tooltip + '"' + clickable + '>';
					if (count > 0) {
						html += '<span class="heatmapCellCount">' + count + '</span>';
						if (dominant) {
							html += '<span class="heatmapCellBadge heatmapBadge' + dominant + '">' + dominant[0] + '</span>';
						}
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
			// Apply the clicked cell as a filter
			var country = sMode === "process" ? sRow : sCol;
			var process = sMode === "process" ? sCol : sRow;
			this._activeFilters.country = country === "(blank)" ? "" : country;
			this._activeFilters.process = process === "(blank)" ? "" : process;

			// Sync filter selects
			var oCountry = this.byId("countryFilter");
			var oProcess = this.byId("processFilter");
			if (oCountry) { oCountry.setSelectedKey(this._activeFilters.country); }
			if (oProcess) { oProcess.setSelectedKey(this._activeFilters.process); }

			this._updateFilterBadge();
			this._loadHeatmap();
			this._loadTopRisks();
			MessageToast.show("Filtered: " + sRow + " × " + sCol);
		},

		onHeatmapToggle: function (oEvent) {
			this._heatmapMode = oEvent.getParameter("item").getKey();
			this._loadHeatmap();
		},

		// ─── Top Risk Areas ───────────────────────────────────────────────────
		_loadTopRisks: function () {
			var oModel = this.getOwnerComponent().getModel();
			if (!oModel) { return; }
			var oList = oModel.bindList("/TopRiskAreas");
			var aFilters = this._buildODataFilters();
			if (aFilters.length) { oList.filter(aFilters); }
			oList.requestContexts(0, 5).then(function (aCtx) {
				var aRisks = aCtx.map(function(c){ return c.getObject(); });
				this._renderTopRiskList(aRisks);
			}.bind(this)).catch(function(e){
				console.error("TopRisks load failed:", e);
				this._renderTopRiskList([]);
			}.bind(this));
		},

		_renderTopRiskList: function (aRisks) {
			var oList = this.byId("topRiskList");
			if (!oList) { return; }
			oList.removeAllItems();
			if (!aRisks || aRisks.length === 0) {
				var oEmpty = new CustomListItem();
				oEmpty.addContent(new Text({ text: "No risk data available", wrapping: false }).addStyleClass("sapUiSmallMargin"));
				oList.addItem(oEmpty);
				return;
			}
			aRisks.forEach(function(risk, idx) {
				var oItem = new CustomListItem({ type: "Navigation", press: this.onViewAllRisks.bind(this) });
				var oRow = new HBox({ alignItems: "Center", justifyContent: "SpaceBetween" }).addStyleClass("topRiskRow");
				// Left: rank + title + subtitle
				var oLeft = new HBox({ alignItems: "Center" });
				var oRank = new Text({ text: String(idx + 1) }).addStyleClass("riskRank rank" + (idx + 1));
				var oInfo = new VBox();
				var sTitle = (risk.riskTitle || "Unknown Risk") + (risk.country ? " \u2013 " + risk.country : "");
				oInfo.addItem(new Text({ text: sTitle, wrapping: false }).addStyleClass("riskTitle"));
				oInfo.addItem(new Text({ text: risk.process || risk.description || "", wrapping: false }).addStyleClass("riskSubtitle"));
				oLeft.addItem(oRank);
				oLeft.addItem(oInfo);
				// Right: criticality badge
				var oBadge = new Text({ text: risk.criticality || "" })
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

			var oList = oModel.bindList(
				"/Risk",
				null,
				null,
				null,
				{
					$orderby: "createdAt desc",
					$filter: "status eq 'Open'"
				}
			);

			oList.requestContexts(0, 3).then(function (aCtx) {

				var aRisks = aCtx.map(function(c) {
					return c.getObject();
				});

				this._renderInvestigationQueue(aRisks);

			}.bind(this)).catch(function(e) {

				console.error("Investigation queue load failed:", e);
				this._renderInvestigationQueue([]);

			}.bind(this));
		},

		_renderInvestigationQueue: function (aRisks) {
			var oList = this.byId("investigationList");
			if (!oList) { return; }
			oList.removeAllItems();
			if (!aRisks || aRisks.length === 0) {
				var oEmpty = new CustomListItem();
				oEmpty.addContent(new Text({ text: "No open incidents", wrapping: false }).addStyleClass("sapUiSmallMargin"));
				oList.addItem(oEmpty);
				return;
			}
			aRisks.forEach(function(risk) {
				var oItem = new CustomListItem({ type: "Navigation", press: this.onViewAllRisks.bind(this) });
				var oRow = new HBox({ alignItems: "Center", justifyContent: "SpaceBetween" }).addStyleClass("invRow");
				var oLeft = new HBox({ alignItems: "Center" });
				var oIcon = new Icon({ src: "sap-icon://document-text" }).addStyleClass("invIcon");
				var oInfo = new VBox();
				var sId = risk.riskId || risk.ID || "";
				var sTitle = (sId ? sId + " \u2013 " : "") + (risk.riskTitle || "Unknown");
				var sProcess = risk.process ? "(" + risk.process + " \u2013 " + (risk.country || "") + ")" : "";
				oInfo.addItem(new Text({ text: sTitle, wrapping: false }).addStyleClass("invTitle"));
				if (sProcess) { oInfo.addItem(new Text({ text: sProcess, wrapping: false }).addStyleClass("invSubtitle")); }
				oLeft.addItem(oIcon);
				oLeft.addItem(oInfo);
				var oTime = new Text({ text: "recently" }).addStyleClass("invTime");
				oRow.addItem(oLeft);
				oRow.addItem(oTime);
				oItem.addContent(oRow);
				oList.addItem(oItem);
			}.bind(this));
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
								return (order[a.criticality] || 99) -
									(order[b.criticality] || 99);
							});

							this._distributionData = aData;

							this._renderDonutLegendFromData(aData);

							this.onDonutRenderComplete();

						}.bind(this))
						.catch(function (e) {
							console.error("Distribution load failed:", e);
						});
				},

				onDonutRenderComplete: function () {

			var oViz = this.byId("donutViz");

			if (!oViz) {
				return;
			}

			oViz.setVizProperties({
				title: {
					visible: false
				},
				plotArea: {
					colorPalette: [
						COLOR_MAP["Critical"],
						COLOR_MAP["High"],
						COLOR_MAP["Medium"],
						COLOR_MAP["Low"],
						COLOR_MAP["Normal"]
					],
					dataLabel: {
						visible: false
					}
				},
				legend: {
					visible: false
				}
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
			var oList = oModel.bindList("/ComplexityProfile");
			oList.requestContexts(0, 10).then(function (aCtx) {
				var aData = aCtx.map(function(c){ return c.getObject(); });
				this._renderComplexityBars(aData);
			}.bind(this)).catch(function(e){ console.error("Complexity profile failed:", e); });
		},

		_renderComplexityBars: function (aData) {
			var oBars = this.byId("complexityBars");
			if (!oBars) { return; }
			oBars.removeAllItems();
			var max = aData.reduce(function(m, d){ return Math.max(m, d.count || 0); }, 1);
			var colorOrder = { "High": COLOR_MAP["High"], "Medium": COLOR_MAP["Medium"], "Low": COLOR_MAP["Low"], "Normal": COLOR_MAP["Normal"] };
			// Sort by defined order
			aData.sort(function(a, b){ return (a.sortOrder || 99) - (b.sortOrder || 99); });
			aData.forEach(function(d) {
				var pct = Math.round((d.count || 0) / max * 100);
				var color = colorOrder[d.complexity] || "#90CAF9";
				var oRow = new HBox({ alignItems: "Center" }).addStyleClass("complexityRow");
				var oLabel = new Text({ text: d.complexity || "Unknown", wrapping: false }).addStyleClass("complexityLabel");
				var oBarWrap = new HBox().addStyleClass("complexityBarWrap");
				// Use HTML for the bar
				var oBarContainer = new HTML({ content:
					'<div class="complexityBar" style="width:' + pct + '%;background:' + color + ';"></div>'
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
			var oCtx = oModel.bindContext("/getFilterOptions(...)");
			oCtx.execute().then(function () {
				var o = oCtx.getBoundContext().getObject();
				if (!o) { return; }
				this._populateSelect("countryFilter",      o.countries || [],      "All Countries");
				this._populateSelect("processFilter",      o.processes || [],      "All Processes");
				this._populateSelect("riskCategoryFilter", o.riskCategories || [], "All");
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
				criticality:  this.byId("criticalityFilter")  ? this.byId("criticalityFilter").getSelectedKey()  : "",
				complexity:   this.byId("complexityFilter")   ? this.byId("complexityFilter").getSelectedKey()   : "",
				riskCategory: this.byId("riskCategoryFilter") ? this.byId("riskCategoryFilter").getSelectedKey() : ""
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
			if (f.criticality)  { aFilters.push(new Filter("criticality",  FilterOperator.EQ, f.criticality)); }
			if (f.complexity)   { aFilters.push(new Filter("complexity",   FilterOperator.EQ, f.complexity)); }
			if (f.riskCategory) { aFilters.push(new Filter("riskCategory", FilterOperator.EQ, f.riskCategory)); }
			return aFilters;
		},

		onResetFilters: function () {
			["countryFilter","processFilter","criticalityFilter","complexityFilter","riskCategoryFilter"].forEach(function(sId) {
				var oCtrl = this.byId(sId);
				if (oCtrl) { oCtrl.setSelectedKey(""); }
			}.bind(this));
			this._activeFilters = {};
			this._updateFilterBadge();
			this._loadHeatmap();
			this._loadTopRisks();
			this._loadRiskDistribution();
			this._loadComplexityProfile();
			MessageToast.show("Filters cleared");
		},

		// ─── Navigation ───────────────────────────────────────────────────────
		onNavigateToUpload: function () {
			var oCrossAppNav = sap.ushell && sap.ushell.Container &&
				sap.ushell.Container.getService("CrossApplicationNavigation");
			if (oCrossAppNav) {
				oCrossAppNav.toExternal({
					target: { semanticObject: "RiskUpload", action: "import" }
				});
			} else {
				window.location.href = "/jnj.com.heatmap.upload/webapp/index.html";
			}
		},

		onRefresh: function () {
			this._loadAll();
			MessageToast.show("Dashboard refreshed");
		},

		onViewAllRisks: function () {
			var oCrossAppNav = sap.ushell && sap.ushell.Container &&
				sap.ushell.Container.getService("CrossApplicationNavigation");
			if (oCrossAppNav) {
				oCrossAppNav.toExternal({
					target: { semanticObject: "RiskList1", action: "manage" }
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
