using HeatmapService as service from './heatmap-service';

// ─── Risk Entity Labels ────────────────────────────────────────────────────────
annotate service.Risk with {
    ID                    @title: 'ID';
    riskId                @title: 'RICEFW';
    riskTitle             @title: 'WRICEF Name';
    description           @title: 'Gap Description';
    owner                 @title: 'FD Owner Name / KT POC';
    ownerEmail            @title: 'Owner Email';
    workstream            @title: 'Scrum Team';
    criticality           @title: 'Priority';
    complexity            @title: 'Complexity';
    riskSeverity          @title: 'Risk Band';
    status                @title: 'Project Status';
    dueDate               @title: 'Due Date';
    comments              @title: 'Comments';
    createdAt             @title: 'Created At';
    modifiedAt            @title: 'Modified At';
    workstreamName        @title: 'Scrum Team';
    country               @title: 'Release';
    serviceArea           @title: 'Scrum Team';
    process               @title: 'Process Function';
    subProcess            @title: 'Sub Process';
    riskCategory          @title: 'RICEFW Type';
    criticalityReason     @title: 'Criticality Reason';
    ricefId               @title: 'RICEFW';
    ricefDescription      @title: 'Common Objects';
    mitigationOwner       @title: 'Mitigation Owner';
    expectedRisk          @title: 'Expected Risk';
    tpoReview             @title: 'TPO Review';
    sapModule             @title: 'SAP Module';
    applicationArea       @title: 'Application Area';
    serviceNowGroup       @title: 'ServiceNow Group';
    jiraComponent         @title: 'Jira Component';
    confluenceSpace       @title: 'Confluence Space';
    truVaultProjectId     @title: 'TruVault Project ID';
    isActive              @title: 'Is Active';
    epicJiraId            @title: 'Epic JIRA ID';
    processFunction       @title: 'Process Function';
    scrumTeam             @title: 'Scrum Team';
    ricefwType            @title: 'RICEFW Type';
    ricefw                @title: 'RICEFW';
    wricefName            @title: 'WRICEF Name';
    commonObjects         @title: 'Common Objects';
    newModifyExtend       @title: 'NEW/Modify/Extend';
    priority              @title: 'Priority';
    fdOwnerNameKtPoc      @title: 'FD Owner Name / KT POC';
    release               @title: 'Release';
    objectType            @title: 'Object Type';
    ktSessionId           @title: 'KT Session ID';
    ktDate                @title: 'KT Date';
    criticalityScore      @title: 'Criticality (1–5)';
    complexityScore       @title: 'Complexity (1–5)';
    tier1Override         @title: 'Tier 1 Override (Y/N)';
    riskScore             @title: 'Risk Score';
    riskBand              @title: 'Risk Band';
    tier                  @title: 'Tier';
    p1Monitoring          @title: 'P1 Monitoring & Observability';
    p2ExceptionHandling   @title: 'P2 Exception & Error Handling';
    p3Supportability      @title: 'P3 Supportability';
    p4KnowledgeReadiness  @title: 'P4 Knowledge & AMS Readiness';
    p5PreventionRecovery  @title: 'P5 Prevention & Recovery';
    p6SecurityAccess      @title: 'P6 Security & Access';
    readinessAverage      @title: 'Readiness Avg';
    lowestPillar          @title: 'Lowest Pillar';
    weakestLinkCap        @title: 'Weakest-Link Cap';
    readinessBand         @title: 'Readiness Band';
    heatMapStatus         @title: 'Heat Map Status';
    action                @title: 'Action';
    projectOwner          @title: 'Project Owner';
    gapStatus             @title: 'Gap Status';
    amsScorer             @title: 'AMS Scorer';
    amsScoredOn           @title: 'AMS Scored On';
    projectResponseDue    @title: 'Project Response Due';
    projectStatus         @title: 'Project Status';
    effectiveProjectStatus @title: 'Effective Project Status';
    tpoConfirmed          @title: 'TPO Confirmed (Y/N)';
    tpoConfirmedOn        @title: 'TPO Confirmed On';
    rescoreDate           @title: 'Rescore Date';
}

// ─── Risk Value Helps ──────────────────────────────────────────────────────────
annotate service.Risk with {
    criticality @(Common: {
        ValueListWithFixedValues: true,
        ValueList: {
            CollectionPath: 'CriticalityVH',
            Parameters: [
                { $Type: 'Common.ValueListParameterOut', LocalDataProperty: criticality, ValueListProperty: 'code' },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'label' }
            ]
        }
    });
    complexity @(Common: {
        ValueListWithFixedValues: true,
        ValueList: {
            CollectionPath: 'ComplexityVH',
            Parameters: [
                { $Type: 'Common.ValueListParameterOut', LocalDataProperty: complexity, ValueListProperty: 'code' },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'label' }
            ]
        }
    });
    riskSeverity @(Common: {
        ValueListWithFixedValues: true,
        ValueList: {
            CollectionPath: 'RiskSeverityVH',
            Parameters: [
                { $Type: 'Common.ValueListParameterOut', LocalDataProperty: riskSeverity, ValueListProperty: 'code' },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'label' }
            ]
        }
    });
    status @(Common: {
        ValueListWithFixedValues: true,
        ValueList: {
            CollectionPath: 'StatusVH',
            Parameters: [
                { $Type: 'Common.ValueListParameterOut', LocalDataProperty: status, ValueListProperty: 'code' },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'label' }
            ]
        }
    });
    workstream @(Common: {
        Text: workstreamName,
        TextArrangement: #TextOnly,
        ValueList: {
            CollectionPath: 'Workstream',
            Parameters: [
                { $Type: 'Common.ValueListParameterOut', LocalDataProperty: workstream_ID, ValueListProperty: 'ID' },
                { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
            ]
        }
    });
}

// ─── Risk: List Report ─────────────────────────────────────────────────────────
annotate service.Risk with @(
    UI: {
        HeaderInfo: {
            TypeName      : 'RICEF',
            TypeNamePlural: 'RICEFs',
            Title         : { Value: wricefName },
            Description   : { Value: ricefw }
        },
        SelectionFields: [
            release,
            processFunction,
            priority,
            complexity,
            riskBand,
            readinessBand,
            effectiveProjectStatus,
            objectType
        ],
        LineItem: [
            { Value: epicJiraId,             Label: 'Epic JIRA ID',                 ![@UI.Importance]: #High },
            { Value: processFunction,        Label: 'Process Function',             ![@UI.Importance]: #High },
            { Value: scrumTeam,              Label: 'Scrum Team',                   ![@UI.Importance]: #High },
            { Value: ricefwType,             Label: 'RICEFW Type',                  ![@UI.Importance]: #High },
            { Value: ricefw,                 Label: 'RICEFW',                       ![@UI.Importance]: #High },
            { Value: wricefName,             Label: 'WRICEF Name',                  ![@UI.Importance]: #High },
            { Value: commonObjects,          Label: 'Common Objects',               ![@UI.Importance]: #High },
            { Value: newModifyExtend,        Label: 'NEW/Modify/Extend',            ![@UI.Importance]: #High },
            { Value: priority,               Label: 'Priority',                     ![@UI.Importance]: #High },
            { Value: complexity,             Label: 'Complexity',                   ![@UI.Importance]: #High },
            { Value: fdOwnerNameKtPoc,       Label: 'FD Owner Name / KT POC',       ![@UI.Importance]: #High },
            { Value: release,                Label: 'Release',                      ![@UI.Importance]: #High },
            { Value: objectType,             Label: 'Object Type',                  ![@UI.Importance]: #High },
            { Value: ktSessionId,            Label: 'KT Session ID',                ![@UI.Importance]: #High },
            { Value: ktDate,                 Label: 'KT Date',                      ![@UI.Importance]: #High },
            { Value: criticalityScore,       Label: 'Criticality (1–5)',            ![@UI.Importance]: #High },
            { Value: complexityScore,        Label: 'Complexity (1–5)',             ![@UI.Importance]: #High },
            { Value: tier1Override,          Label: 'Tier 1 Override (Y/N)',        ![@UI.Importance]: #High },
            { Value: riskScore,              Label: 'Risk Score',                   ![@UI.Importance]: #High },
            { Value: riskBand,               Label: 'Risk Band',                    ![@UI.Importance]: #High },
            { Value: tier,                   Label: 'Tier',                         ![@UI.Importance]: #High },
            { Value: p1Monitoring,           Label: 'P1 Monitoring & Observability',![@UI.Importance]: #High },
            { Value: p2ExceptionHandling,    Label: 'P2 Exception & Error Handling',![@UI.Importance]: #High },
            { Value: p3Supportability,       Label: 'P3 Supportability',            ![@UI.Importance]: #High },
            { Value: p4KnowledgeReadiness,   Label: 'P4 Knowledge & AMS Readiness', ![@UI.Importance]: #High },
            { Value: p5PreventionRecovery,   Label: 'P5 Prevention & Recovery',     ![@UI.Importance]: #High },
            { Value: p6SecurityAccess,       Label: 'P6 Security & Access',         ![@UI.Importance]: #High },
            { Value: readinessAverage,       Label: 'Readiness Avg',                ![@UI.Importance]: #High },
            { Value: lowestPillar,           Label: 'Lowest Pillar',                ![@UI.Importance]: #High },
            { Value: weakestLinkCap,         Label: 'Weakest-Link Cap',             ![@UI.Importance]: #High },
            { Value: readinessBand,          Label: 'Readiness Band',               ![@UI.Importance]: #High },
            { Value: heatMapStatus,          Label: 'Heat Map Status',              ![@UI.Importance]: #High },
            { Value: description,            Label: 'Gap Description',              ![@UI.Importance]: #High },
            { Value: action,                 Label: 'Action',                       ![@UI.Importance]: #High },
            { Value: projectOwner,           Label: 'Project Owner',                ![@UI.Importance]: #High },
            { Value: dueDate,                Label: 'Due Date',                     ![@UI.Importance]: #High },
            { Value: gapStatus,              Label: 'Gap Status',                   ![@UI.Importance]: #High },
            { Value: amsScorer,              Label: 'AMS Scorer',                   ![@UI.Importance]: #High },
            { Value: amsScoredOn,            Label: 'AMS Scored On',                ![@UI.Importance]: #High },
            { Value: projectResponseDue,     Label: 'Project Response Due',         ![@UI.Importance]: #High },
            { Value: projectStatus,          Label: 'Project Status',               ![@UI.Importance]: #High },
            { Value: effectiveProjectStatus, Label: 'Effective Project Status',     ![@UI.Importance]: #High },
            { Value: tpoConfirmed,           Label: 'TPO Confirmed (Y/N)',          ![@UI.Importance]: #High },
            { Value: tpoConfirmedOn,         Label: 'TPO Confirmed On',             ![@UI.Importance]: #High },
            { Value: rescoreDate,            Label: 'Rescore Date',                 ![@UI.Importance]: #High },
            { Value: comments,               Label: 'Comments',                     ![@UI.Importance]: #High }
        ]
    }
);

// ─── Risk: Object Page ─────────────────────────────────────────────────────────
annotate service.Risk with @(
    UI: {
        Facets: [
            {
                $Type : 'UI.ReferenceFacet',
                Label : 'RICEF Details',
                ID    : 'TrackerDetails',
                Target: '@UI.FieldGroup#TrackerDetails'
            },
            {
                $Type : 'UI.ReferenceFacet',
                Label : 'Risk & Readiness Scoring',
                ID    : 'TrackerReadiness',
                Target: '@UI.FieldGroup#TrackerReadiness'
            },
            {
                $Type : 'UI.ReferenceFacet',
                Label : 'Project Tracking',
                ID    : 'ProjectTracking',
                Target: '@UI.FieldGroup#ProjectTracking'
            },
            {
                $Type : 'UI.ReferenceFacet',
                Label : 'Mitigation Plans',
                ID    : 'MitigationPlans',
                Target: 'mitigationPlans/@UI.LineItem'
            },
            {
                $Type : 'UI.ReferenceFacet',
                Label : 'Action Tracker',
                ID    : 'ActionTracker',
                Target: 'actionTrackers/@UI.LineItem'
            }
        ],
        FieldGroup#TrackerDetails: {
            Label: 'RICEF Details',
            Data: [
                { Value: epicJiraId },
                { Value: processFunction },
                { Value: scrumTeam },
                { Value: ricefwType },
                { Value: ricefw },
                { Value: wricefName },
                { Value: commonObjects },
                { Value: newModifyExtend },
                { Value: priority },
                { Value: complexity },
                { Value: fdOwnerNameKtPoc },
                { Value: release },
                { Value: objectType },
                { Value: ktSessionId },
                { Value: ktDate }
            ]
        },
        FieldGroup#TrackerReadiness: {
            Label: 'Risk & Readiness Scoring',
            Data: [
                { Value: criticalityScore },
                { Value: complexityScore },
                { Value: tier1Override },
                { Value: riskScore },
                { Value: riskBand },
                { Value: tier },
                { Value: p1Monitoring },
                { Value: p2ExceptionHandling },
                { Value: p3Supportability },
                { Value: p4KnowledgeReadiness },
                { Value: p5PreventionRecovery },
                { Value: p6SecurityAccess },
                { Value: readinessAverage },
                { Value: lowestPillar },
                { Value: weakestLinkCap },
                { Value: readinessBand },
                { Value: heatMapStatus }
            ]
        },
        FieldGroup#ProjectTracking: {
            Label: 'Project Tracking',
            Data: [
                { Value: description },
                { Value: action },
                { Value: projectOwner },
                { Value: dueDate },
                { Value: gapStatus },
                { Value: amsScorer },
                { Value: amsScoredOn },
                { Value: projectResponseDue },
                { Value: projectStatus },
                { Value: effectiveProjectStatus },
                { Value: tpoConfirmed },
                { Value: tpoConfirmedOn },
                { Value: rescoreDate },
                { Value: comments }
            ]
        }
    }
);

// ─── MitigationPlan Labels & List ─────────────────────────────────────────────
annotate service.MitigationPlan with {
    description @title: 'Description';
    owner       @title: 'Owner';
    dueDate     @title: 'Due Date';
    status      @title: 'Status';
}

annotate service.MitigationPlan with @(
    UI.LineItem: [
        { Value: description, Label: 'Description', ![@UI.Importance]: #High },
        { Value: owner,       Label: 'Owner',       ![@UI.Importance]: #Medium },
        { Value: dueDate,     Label: 'Due Date',    ![@UI.Importance]: #Medium },
        { Value: status,      Label: 'Status',      ![@UI.Importance]: #High }
    ]
);

// ─── ActionTracker Labels & List ──────────────────────────────────────────────
annotate service.ActionTracker with {
    actionItem     @title: 'Action Item';
    assignee       @title: 'Assignee';
    dueDate        @title: 'Due Date';
    completionDate @title: 'Completion Date';
    status         @title: 'Status';
    priority       @title: 'Priority';
}

annotate service.ActionTracker with @(
    UI.LineItem: [
        { Value: actionItem,     Label: 'Action Item',     ![@UI.Importance]: #High },
        { Value: assignee,       Label: 'Assignee',        ![@UI.Importance]: #Medium },
        { Value: priority,       Label: 'Priority',        ![@UI.Importance]: #Medium },
        { Value: dueDate,        Label: 'Due Date',        ![@UI.Importance]: #Medium },
        { Value: status,         Label: 'Status',          ![@UI.Importance]: #High },
        { Value: completionDate, Label: 'Completion Date', ![@UI.Importance]: #Low }
    ]
);

// ─── HeatmapSummary Labels ────────────────────────────────────────────────────
annotate service.HeatmapSummary with {
    riskBand      @title: 'Risk Band';
    readinessBand @title: 'Readiness Band';
    count         @title: 'RICEF Count';
}

// ─── WorkstreamAnalytics Labels ───────────────────────────────────────────────
annotate service.WorkstreamAnalytics with {
    workstreamName @title: 'Workstream';
    criticality    @title: 'Criticality';
    status         @title: 'Status';
    count          @title: 'Count';
}

// ─── UploadBatch Labels ───────────────────────────────────────────────────────
annotate service.UploadBatch with {
    fileName    @title: 'File Name';
    recordCount @title: 'Records Uploaded';
    errorCount  @title: 'Errors';
    status      @title: 'Status';
    message     @title: 'Message';
    createdAt   @title: 'Uploaded At';
}

annotate service.UploadBatch with @(
    UI: {
        HeaderInfo: {
            TypeName      : 'Upload Batch',
            TypeNamePlural: 'Upload Batches',
            Title         : { Value: fileName },
            Description   : { Value: status }
        },
        LineItem: [
            { Value: fileName,    Label: 'File Name',        ![@UI.Importance]: #High },
            { Value: status,      Label: 'Status',           ![@UI.Importance]: #High },
            { Value: recordCount, Label: 'Records Uploaded', ![@UI.Importance]: #Medium },
            { Value: errorCount,  Label: 'Errors',           ![@UI.Importance]: #Medium },
            { Value: createdAt,   Label: 'Uploaded At',      ![@UI.Importance]: #High }
        ]
    }
);
