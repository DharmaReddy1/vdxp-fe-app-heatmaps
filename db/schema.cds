using {
    cuid,
    managed
} from '@sap/cds/common';

namespace jnj.com.heatmap;

// ─── Workstream ────────────────────────────────────────────────────────────────
entity Workstream : cuid, managed {
    name        : String(100) @mandatory;
    description : String(255);
    risks       : Association to many Risk
                      on risks.workstream = $self;
}

// ─── Upload Batch ──────────────────────────────────────────────────────────────
entity UploadBatch : cuid, managed {
    fileName    : String(255);
    recordCount : Integer default 0;
    errorCount  : Integer default 0;
    status      : String(30) default 'Pending'; // Pending | Processing | Completed | Failed
    message     : String(500);
    risks       : Association to many Risk
                      on risks.uploadBatch = $self;
}

// ─── Risk (main entity) ────────────────────────────────────────────────────────
entity Risk : cuid, managed {
    riskId            : String(50);
    riskTitle         : String(255) @mandatory;
    description       : String(1000);
    owner             : String(100);
    ownerEmail        : String(150);
    workstream        : Association to Workstream;
    uploadBatch       : Association to UploadBatch;
    criticality       : String(20); // Low | Medium | High | Critical
    complexity        : String(20); // Low | Medium | High
    riskSeverity      : String(20); // Low | Medium | High | Critical
    status            : String(30); // Open | In Progress | Mitigated | Closed
    dueDate           : Date;
    comments          : String(1000);
    // ─── Excel columns ───────────────────────────────────────────────────────
    country           : String(100); // Country
    // epicJira       : String(100); // Epic Jira
    serviceArea       : String(100); // ServiceArea
    process           : String(200); // Process function
    subProcess        : String(200); // SubProcess
    riskCategory      : String(50); // RiskCategory
    criticalityReason : String(500); // CriticalityReason
    ricefId           : String(50); // RICEFID
    ricefDescription  : String(500); // RICEFDescription
    mitigationOwner   : String(100); // MitigationOwner
    expectedRisk      : String(20); // ExpectedRisk
    tpoReview         : String(500); // TPOReview
    sapModule         : String(20); // SAPModule
    applicationArea   : String(50); // ApplicationArea
    serviceNowGroup   : String(100); // ServiceNowGroup
    jiraComponent     : String(100); // JiraComponent
    confluenceSpace   : String(100); // ConfluenceSpace
    truVaultProjectId : String(50); // TruVaultProjectID
    isActive          : String(5); // IsActive (Yes | No)
    // ─────────────────────────────────────────────────────────────────────────
    mitigationPlans   : Composition of many MitigationPlan
                            on mitigationPlans.risk = $self;
    actionTrackers    : Composition of many ActionTracker
                            on actionTrackers.risk = $self;
}

// ─── Mitigation Plan ──────────────────────────────────────────────────────────
entity MitigationPlan : cuid, managed {
    risk        : Association to Risk;
    description : String(1000) @mandatory;
    owner       : String(100);
    dueDate     : Date;
    status      : String(30) default 'Open'; // Open | In Progress | Completed
}

// ─── Action Tracker ───────────────────────────────────────────────────────────
entity ActionTracker : cuid, managed {
    risk           : Association to Risk;
    actionItem     : String(500) @mandatory;
    assignee       : String(100);
    dueDate        : Date;
    completionDate : Date;
    status         : String(30) default 'Open'; // Open | In Progress | Completed | Overdue
    priority       : String(20) default 'Medium'; // Low | Medium | High
}

// ─── Heatmap Category (lookup / config) ───────────────────────────────────────
entity HeatmapCategory : cuid {
    complexity   : String(20) @mandatory;
    riskSeverity : String(20) @mandatory;
    criticality  : String(20);
    label        : String(100);
    colorCode    : String(20); // e.g. #FF0000
}

// ─── CDS View: Heatmap Summary (Country x Process) ───────────────────────────
entity HeatmapSummaryView      as
    select from Risk {
        key country                     : String(100),
        key process                     : String(200),
            count( * ) as count         : Integer,
            // dominant criticality (highest) for color coding
            sum(case
                    criticality
                    when 'Critical'
                         then 1
                    else 0
                end)   as criticalCount : Integer,
            sum(case
                    criticality
                    when 'High'
                         then 1
                    else 0
                end)   as highCount     : Integer,
            sum(case
                    criticality
                    when 'Medium'
                         then 1
                    else 0
                end)   as mediumCount   : Integer,
            sum(case
                    criticality
                    when 'Low'
                         then 1
                    else 0
                end)   as lowCount      : Integer,
            sum(case
                    criticality
                    when 'Normal'
                         then 1
                    else 0
                end)   as normalCount   : Integer
    }
    group by
        country,
        process;

// ─── CDS View: Heatmap by Complexity x RiskSeverity ──────────────────────────
entity HeatmapComplexityView   as
    select from Risk {
        key complexity                    : String(20),
        key riskSeverity                  : String(20),
            count( * ) as count           : Integer,
            case
                complexity
                when 'Low'
                     then 1
                when 'Medium'
                     then 2
                when 'High'
                     then 3
                else 4
            end        as complexityOrder : Integer,
            case
                riskSeverity
                when 'Low'
                     then 1
                when 'Medium'
                     then 2
                when 'High'
                     then 3
                when 'Critical'
                     then 4
                else 5
            end        as severityOrder   : Integer
    }
    group by
        complexity,
        riskSeverity;

// ─── CDS View: Workstream Analytics ──────────────────────────────────────────
entity WorkstreamAnalyticsView as
    select from Risk {
        key workstream.name as workstreamName : String(100),
        key criticality                       : String(20),
        key status                            : String(20),
            count( * )      as count          : Integer
    }
    group by
        workstream.name,
        criticality,
        status;

// ─── CDS View: Top Risk Areas ─────────────────────────────────────────────────
entity TopRiskAreasView        as
    select from Risk {
        key ID,
            riskTitle,
            country,
            process,
            criticality,
            status,
            createdAt
    }
    where
        status != 'Closed'
    order by
        case
            criticality
            when 'High'
                 then 1
            when 'Medium'
                 then 2
            when 'Low'
                 then 3
            else 4
        end       asc,
        createdAt desc;

// ─── CDS View: Complexity Profile ────────────────────────────────────────────
entity ComplexityProfileView   as
    select from Risk {
        key complexity              : String(20),
            count( * ) as count     : Integer,
            case
                complexity
                when 'High'
                     then 1
                when 'Medium'
                     then 2
                when 'Low'
                     then 3
                else 4
            end        as sortOrder : Integer
    }
    group by
        complexity;

// ─── CDS View: Risk Distribution by Criticality ───────────────────────────────
entity RiskDistributionView    as
    select from Risk {
        key criticality             : String(20),
            count( * ) as count     : Integer,
            case
                criticality
                when 'High'
                     then 1
                when 'Medium'
                     then 2
                when 'Low'
                     then 3
                when 'Normal'
                     then 4
                else 5
            end        as sortOrder : Integer
    }
    group by
        criticality;

// ─── Value Help Entities ──────────────────────────────────────────────────────
entity CriticalityVH {
    key code  : String(20);
        label : String(50);
}

entity ComplexityVH {
    key code  : String(20);
        label : String(50);
}

entity RiskSeverityVH {
    key code  : String(20);
        label : String(50);
}

entity StatusVH {
    key code  : String(20);
        label : String(50);
}
