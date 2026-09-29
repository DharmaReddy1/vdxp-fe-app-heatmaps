using HeatmapService as service from './heatmap-service';

// ─── Risk Entity Labels ────────────────────────────────────────────────────────
annotate service.Risk with {
    ID                @title: 'ID';
    riskId            @title: 'Risk ID';
    riskTitle         @title: 'Risk Title';
    description       @title: 'Description';
    owner             @title: 'Risk Owner';
    ownerEmail        @title: 'Owner Email';
    workstream        @title: 'Workstream';
    criticality       @title: 'Criticality';
    complexity        @title: 'Complexity';
    riskSeverity      @title: 'Risk Severity';
    status            @title: 'Status';
    dueDate           @title: 'Due Date';
    comments          @title: 'Comments';
    createdAt         @title: 'Created At';
    modifiedAt        @title: 'Modified At';
    workstreamName    @title: 'Workstream';
    // Excel columns
    country           @title: 'Country';
    serviceArea       @title: 'Service Area';
    process           @title: 'Process';
    subProcess        @title: 'Sub Process';
    riskCategory      @title: 'Risk Category';
    criticalityReason @title: 'Criticality Reason';
    ricefId           @title: 'RICEF ID';
    ricefDescription  @title: 'RICEF Description';
    mitigationOwner   @title: 'Mitigation Owner';
    expectedRisk      @title: 'Expected Risk';
    tpoReview         @title: 'TPO Review';
    sapModule         @title: 'SAP Module';
    applicationArea   @title: 'Application Area';
    serviceNowGroup   @title: 'ServiceNow Group';
    jiraComponent     @title: 'Jira Component';
    confluenceSpace   @title: 'Confluence Space';
    truVaultProjectId @title: 'TruVault Project ID';
    isActive          @title: 'Is Active';
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
            TypeName      : 'Risk',
            TypeNamePlural: 'Risks',
            Title         : { Value: riskTitle },
            Description   : { Value: riskId }
        },
        SelectionFields: [
            criticality,
            complexity,
            riskSeverity,
            workstream_ID,
            status,
            owner
        ],
        LineItem: [
            { Value: ricefId,           Label: 'RICEF ID',            ![@UI.Importance]: #High },
            { Value: country,           Label: 'Country',             ![@UI.Importance]: #High },
            { Value: serviceArea,       Label: 'Service Area',        ![@UI.Importance]: #High },
            { Value: process,           Label: 'Process',             ![@UI.Importance]: #High },
            { Value: subProcess,        Label: 'Sub Process',         ![@UI.Importance]: #High },
            { Value: criticality,       Label: 'Criticality',         ![@UI.Importance]: #High,
              Criticality: {
                $edmJson: { $If: [
                    { $Eq: [{ $Path: 'criticality' }, 'Critical'] }, 1,
                    { $If: [{ $Eq: [{ $Path: 'criticality' }, 'High'] }, 2,
                        { $If: [{ $Eq: [{ $Path: 'criticality' }, 'Medium'] }, 3, 0] }
                    ]}
                ]}
              }
            },
            { Value: complexity,        Label: 'Complexity',          ![@UI.Importance]: #High },
            { Value: riskSeverity,      Label: 'Severity Score',      ![@UI.Importance]: #High },
            { Value: riskCategory,      Label: 'Risk Category',       ![@UI.Importance]: #High },
            { Value: riskTitle,         Label: 'Risk Description',    ![@UI.Importance]: #High },
            { Value: criticalityReason, Label: 'Criticality Reason',  ![@UI.Importance]: #Medium },
            { Value: ricefDescription,  Label: 'RICEF Description',   ![@UI.Importance]: #Medium },
            { Value: mitigationOwner,   Label: 'Mitigation Owner',    ![@UI.Importance]: #Medium },
            { Value: expectedRisk,      Label: 'Expected Risk',       ![@UI.Importance]: #Medium },
            { Value: tpoReview,         Label: 'TPO Review',          ![@UI.Importance]: #Medium },
            { Value: sapModule,         Label: 'SAP Module',          ![@UI.Importance]: #Medium },
            { Value: applicationArea,   Label: 'Application Area',    ![@UI.Importance]: #Medium },
            { Value: serviceNowGroup,   Label: 'ServiceNow Group',    ![@UI.Importance]: #Medium },
            { Value: jiraComponent,     Label: 'Jira Component',      ![@UI.Importance]: #Medium },
            { Value: confluenceSpace,   Label: 'Confluence Space',    ![@UI.Importance]: #Medium },
            { Value: truVaultProjectId, Label: 'TruVault Project ID', ![@UI.Importance]: #Medium },
            { Value: isActive,          Label: 'Is Active',           ![@UI.Importance]: #High }
        ]
    }
);

// ─── Risk: Object Page ─────────────────────────────────────────────────────────
annotate service.Risk with @(
    UI: {
        Facets: [
            {
                $Type : 'UI.CollectionFacet',
                Label : 'Risk Information',
                ID    : 'RiskInfo',
                Facets: [
                    {
                        $Type : 'UI.ReferenceFacet',
                        Label : 'General',
                        ID    : 'RiskGeneral',
                        Target: '@UI.FieldGroup#General'
                    },
                    {
                        $Type : 'UI.ReferenceFacet',
                        Label : 'Classification',
                        ID    : 'RiskClass',
                        Target: '@UI.FieldGroup#Classification'
                    }
                ]
            },
            {
                $Type : 'UI.ReferenceFacet',
                Label : 'SAP & Integration Details',
                ID    : 'ExcelDetails',
                Target: '@UI.FieldGroup#ExcelDetails'
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
        FieldGroup#General: {
            Label: 'Basic Information',
            Data: [
                { Value: ricefId },
                { Value: country },
                { Value: serviceArea },
                { Value: process },
                { Value: subProcess },
                { Value: isActive }
            ]
        },
        FieldGroup#Classification: {
            Label: 'Risk Classification',
            Data: [
                { Value: criticality },
                { Value: complexity },
                { Value: riskSeverity },
                { Value: riskCategory },
                { Value: riskTitle },
                { Value: criticalityReason },
                { Value: expectedRisk }
            ]
        },
        FieldGroup#ExcelDetails: {
            Label: 'SAP & Integration Details',
            Data: [
                { Value: ricefDescription },
                { Value: mitigationOwner },
                { Value: tpoReview },
                { Value: sapModule },
                { Value: applicationArea },
                { Value: serviceNowGroup },
                { Value: jiraComponent },
                { Value: confluenceSpace },
                { Value: truVaultProjectId }
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
    complexity   @title: 'Complexity';
    riskSeverity @title: 'Risk Severity';
    criticality  @title: 'Criticality';
    count        @title: 'Count';
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
