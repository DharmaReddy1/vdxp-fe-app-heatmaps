sap.ui.define(["sap/ui/core/ValueState", "sap/ui/core/IndicationColor"], function (ValueState, IndicationColor) {
	"use strict";

	return {

		/**
		 * Returns a sap.ui.core.ValueState based on criticality string.
		 * Used for ObjectStatus state binding.
		 * @param {string} sCriticality - e.g. "Critical", "High", "Medium", "Low"
		 * @returns {sap.ui.core.ValueState}
		 */
		criticalityToState: function (sCriticality) {
			switch (sCriticality) {
				case "Critical": return ValueState.Error;
				case "High":     return ValueState.Warning;
				case "Medium":   return ValueState.Information;
				case "Low":      return ValueState.Success;
				default:         return ValueState.None;
			}
		},

		/**
		 * Returns a sap.ui.core.ValueState based on risk status string.
		 * @param {string} sStatus - e.g. "Open", "In Progress", "Mitigated", "Closed"
		 * @returns {sap.ui.core.ValueState}
		 */
		statusToState: function (sStatus) {
			switch (sStatus) {
				case "Open":        return ValueState.Error;
				case "In Progress": return ValueState.Warning;
				case "Mitigated":   return ValueState.Success;
				case "Closed":      return ValueState.Success;
				default:            return ValueState.None;
			}
		},

		/**
		 * Returns a SAP icon name for a given risk status.
		 * @param {string} sStatus
		 * @returns {string} icon URI e.g. "sap-icon://status-critical"
		 */
		statusToIcon: function (sStatus) {
			switch (sStatus) {
				case "Open":        return "sap-icon://status-negative";
				case "In Progress": return "sap-icon://status-in-process";
				case "Mitigated":   return "sap-icon://status-positive";
				case "Closed":      return "sap-icon://status-completed";
				default:            return "sap-icon://status-inactive";
			}
		},

		/**
		 * Returns a SAP icon name for a given criticality level.
		 * @param {string} sCriticality
		 * @returns {string} icon URI
		 */
		criticalityToIcon: function (sCriticality) {
			switch (sCriticality) {
				case "Critical": return "sap-icon://alert";
				case "High":     return "sap-icon://warning";
				case "Medium":   return "sap-icon://message-information";
				case "Low":      return "sap-icon://message-success";
				default:         return "sap-icon://question-mark";
			}
		},

		/**
		 * Formats a date value (string or Date) to locale date string.
		 * @param {string|Date} vDate
		 * @returns {string} formatted date or empty string
		 */
		formatDate: function (vDate) {
			if (!vDate) { return ""; }
			try {
				const oDate = (vDate instanceof Date) ? vDate : new Date(vDate);
				if (isNaN(oDate.getTime())) { return String(vDate); }
				return oDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
			} catch (e) {
				return String(vDate);
			}
		},

		/**
		 * Returns true if a due date is overdue (past today and status is not Closed/Mitigated).
		 * @param {string|Date} vDate
		 * @param {string} sStatus
		 * @returns {boolean}
		 */
		isOverdue: function (vDate, sStatus) {
			if (!vDate || sStatus === "Closed" || sStatus === "Mitigated") { return false; }
			try {
				const oDate = (vDate instanceof Date) ? vDate : new Date(vDate);
				return oDate < new Date();
			} catch (e) {
				return false;
			}
		},

		/**
		 * Returns ValueState.Error if overdue, else ValueState.None.
		 * @param {string|Date} vDate
		 * @param {string} sStatus
		 * @returns {sap.ui.core.ValueState}
		 */
		dueDateState: function (vDate, sStatus) {
			return this.isOverdue(vDate, sStatus) ? ValueState.Error : ValueState.None;
		},

		/**
		 * Formats a number to a string, returning empty string for null/undefined.
		 * @param {number} nValue
		 * @returns {string}
		 */
		formatCount: function (nValue) {
			return (nValue !== null && nValue !== undefined) ? String(nValue) : "";
		},

		/**
		 * Returns an IndicationColor for heatmap cell coloring based on criticality.
		 * @param {string} sCriticality
		 * @returns {sap.ui.core.IndicationColor}
		 */
		criticalityToIndicationColor: function (sCriticality) {
			switch (sCriticality) {
				case "Critical": return IndicationColor.Indication06; // dark red
				case "High":     return IndicationColor.Indication04; // orange
				case "Medium":   return IndicationColor.Indication03; // yellow
				case "Low":      return IndicationColor.Indication08; // teal
				default:         return IndicationColor.Indication01;
			}
		}
	};
});
