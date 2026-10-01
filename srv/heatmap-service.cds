using { jnj.com.heatmap as db } from '../db/schema';

service HeatmapService @(path: '/heatmap') {

    // ─── Core Entities ─────────────────────────────────────────────────────────

    @odata.draft.enabled
    @cds.redirection.target
    entity Risk as projection on db.Risk {
        *,
        workstream.name as workstreamName : String(100),
    } actions {
        action exportToExcel() returns String;
    };

    entity Workstream     as projection on db.Workstream;
    entity MitigationPlan as projection on db.MitigationPlan;
    entity ActionTracker  as projection on db.ActionTracker;
    entity UploadBatch    as projection on db.UploadBatch;
    entity HeatmapCategory as projection on db.HeatmapCategory;

    // ─── Read-Only Analytical Views ────────────────────────────────────────────

    @readonly entity HeatmapSummary      as projection on db.HeatmapSummaryView;
    @readonly entity HeatmapComplexity   as projection on db.HeatmapComplexityView;
    @readonly entity WorkstreamAnalytics as projection on db.WorkstreamAnalyticsView;
    @readonly entity TopRiskAreas        as projection on db.TopRiskAreasView;
    @readonly entity ComplexityProfile   as projection on db.ComplexityProfileView;
    @readonly entity RiskDistribution    as projection on db.RiskDistributionView;

    // ─── Value Helps ───────────────────────────────────────────────────────────

    @readonly entity CriticalityVH  as projection on db.CriticalityVH;
    @readonly entity ComplexityVH   as projection on db.ComplexityVH;
    @readonly entity RiskSeverityVH as projection on db.RiskSeverityVH;
    @readonly entity StatusVH       as projection on db.StatusVH;

    // ─── Unbound Actions / Functions ───────────────────────────────────────────

    action uploadExcel(
        fileContent : LargeString,
        fileName    : String(255),
        replaceExisting : Boolean
    ) returns UploadBatch;

    function getDashboardKPIs() returns {
        totalRICEFs         : Integer;
        tier1Objects        : Integer;
        immediateAction     : Integer;
        mitigationRequired  : Integer;
        monitor             : Integer;
        controlled          : Integer;
        lastRefreshed   : String;
    };

    function getFilterOptions() returns {
        countries    : array of String;
        processes    : array of String;
        riskCategories : array of String;
    };
}
