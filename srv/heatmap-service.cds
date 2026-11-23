using { jnj.com.heatmap as db } from '../db/schema';

service HeatmapService @(path: '/heatmap') {

    // ─── Core Entities ─────────────────────────────────────────────────────────

    @odata.draft.enabled
    @cds.redirection.target
    entity Risk as projection on db.Risk {
        *,
        workstream.name as workstreamName : String(100),
        case
            when epicJiraId is null or epicJiraId = '' then null
            else concat('https://jira.jnj.com/projects/JGHJ/issues/', epicJiraId)
        end as epicJiraUrl : String(255),
        case
            when ricefw is null or ricefw = '' then null
            else concat('https://confluence.jnj.com/spaces/VBPO/pages/1036796221/', ricefw)
        end as ricefwUrl : String(512),
        case
            when epicJiraId = 'JGHJ-53886' then 'https://jnj.sharepoint.com/teams/IMTranscend-15-OperateState/Shared%20Documents/Forms/AllItems.aspx?id=%2Fteams%2FIMTranscend%2D15%2DOperateState%2FShared%20Documents%2F02%2E0%5FApplication%20and%20Platform%20Support%2FApplication%20Support%2FIBM%20Know'
            else null
        end as ktSessionUrl : String(1024),
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
