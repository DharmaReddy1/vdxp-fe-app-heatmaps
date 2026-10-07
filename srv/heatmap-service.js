import cds from '@sap/cds';
import XLSX from 'xlsx';
import { readFile } from 'node:fs/promises';

export default class HeatmapService extends cds.ApplicationService {

    async init() {
        const { Risk, MitigationPlan, ActionTracker, Workstream,
                UploadBatch, HeatmapSummary, WorkstreamAnalytics } = this.entities;

        // ─── uploadExcel Action ───────────────────────────────────────────────
        this.on('uploadExcel', async (req) => {
            const { fileContent, fileName, replaceExisting } = req.data;

            if (!fileContent) {
                return req.error(400, 'No file content provided');
            }
            if (replaceExisting && cds.env.profiles && cds.env.profiles.includes('production')) {
                return req.error(403, 'Replacing existing risk records is disabled in production.');
            }

            // Create a pending UploadBatch record
            const batch = await INSERT.into(UploadBatch).entries({
                fileName,
                status: 'Processing',
                recordCount: 0,
                errorCount: 0
            });

            const batchId = batch.ID || (await SELECT.one.from(UploadBatch)
                .orderBy('createdAt desc')
                .columns('ID')).ID;

            try {
                // Decode base64 Excel content
                const buffer = Buffer.from(fileContent, 'base64');
                const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

                const sheetName = workbook.SheetNames.find(name => name.toLowerCase() === 'tracker') || workbook.SheetNames[0];
                if (replaceExisting && sheetName.toLowerCase() !== 'tracker') {
                    return req.error(400, 'Replace mode is only supported for workbooks with a Tracker sheet.');
                }
                const sheet = workbook.Sheets[sheetName];

                // Auto-detect the header row: scan raw rows for the first row
                // where at least 3 cells are non-empty strings (skips title/blank rows)
                const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                let headerRowIndex = 0;
                for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
                    const nonEmptyStrings = rawRows[i].filter(c => typeof c === 'string' && c.trim().length > 0);
                    if (nonEmptyStrings.length >= 3) {
                        headerRowIndex = i;
                        break;
                    }
                }
                cds.log('heatmap').info(`📋 Header row detected at row ${headerRowIndex + 1}:`, rawRows[headerRowIndex]);

                // Re-parse using the detected header row
                const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', header: rawRows[headerRowIndex] })
                    .slice(headerRowIndex + 1)  // skip the header row itself
                    .filter(row => Object.values(row).some(v => v !== '')); // skip blank rows

                if (!rows || rows.length === 0) {
                    await UPDATE(UploadBatch, batchId).with({
                        status: 'Failed',
                        message: 'No data rows found in the Excel file'
                    });
                    return req.error(400, 'No data rows found in the Excel file');
                }

                // Detect column names from first row (case-insensitive)
                const rawHeaders = Object.keys(rows[0]);
                cds.log('heatmap').info('📋 Excel headers detected:', rawHeaders);
                const colMap = buildColumnMap(rawHeaders);
                cds.log('heatmap').info('🗺️  Column map resolved:', JSON.stringify(colMap, null, 2));

                const risks = [];
                const mitigations = [];
                const actions = [];
                const workstreamCache = {};
                let errorCount = 0;

                for (const row of rows) {
                    try {
                        // Resolve workstream
                        const wsName = getVal(row, colMap.scrumTeam) || getVal(row, colMap.workstream);
                        let workstreamId = null;
                        if (wsName) {
                            if (!workstreamCache[wsName]) {
                                // Find or create workstream
                                let ws = await SELECT.one.from(Workstream).where({ name: wsName });
                                if (!ws) {
                                    const newWs = await INSERT.into(Workstream).entries({ name: wsName });
                                    ws = await SELECT.one.from(Workstream).where({ name: wsName });
                                }
                                workstreamCache[wsName] = ws.ID;
                            }
                            workstreamId = workstreamCache[wsName];
                        }

                        const trackerFields = {
                            epicJiraId: getVal(row, colMap.epicJiraId) || undefined,
                            processFunction: getVal(row, colMap.processFunction) || undefined,
                            scrumTeam: wsName || undefined,
                            ricefwType: getVal(row, colMap.ricefwType) || undefined,
                            ricefw: getVal(row, colMap.ricefw) || undefined,
                            wricefName: getVal(row, colMap.wricefName) || undefined,
                            commonObjects: getVal(row, colMap.commonObjects) || undefined,
                            newModifyExtend: getVal(row, colMap.newModifyExtend) || undefined,
                            priority: getVal(row, colMap.priority) || undefined,
                            fdOwnerNameKtPoc: getVal(row, colMap.fdOwnerNameKtPoc) || undefined,
                            release: getVal(row, colMap.release) || undefined,
                            objectType: getVal(row, colMap.objectType) || undefined,
                            ktSessionId: getVal(row, colMap.ktSessionId) || undefined,
                            ktDate: parseDate(getVal(row, colMap.ktDate)),
                            criticalityScore: parseNumber(getVal(row, colMap.criticalityScore)),
                            complexityScore: parseNumber(getVal(row, colMap.complexityScore)),
                            tier1Override: getVal(row, colMap.tier1Override) || undefined,
                            p1Monitoring: parseNumber(getVal(row, colMap.p1Monitoring)),
                            p2ExceptionHandling: parseNumber(getVal(row, colMap.p2ExceptionHandling)),
                            p3Supportability: parseNumber(getVal(row, colMap.p3Supportability)),
                            p4KnowledgeReadiness: parseNumber(getVal(row, colMap.p4KnowledgeReadiness)),
                            p5PreventionRecovery: parseNumber(getVal(row, colMap.p5PreventionRecovery)),
                            p6SecurityAccess: parseNumber(getVal(row, colMap.p6SecurityAccess)),
                            gapDescription: getVal(row, colMap.gapDescription) || undefined,
                            action: getVal(row, colMap.action) || undefined,
                            projectOwner: getVal(row, colMap.projectOwner) || undefined,
                            dueDate: parseDate(getVal(row, colMap.dueDate)),
                            gapStatus: getVal(row, colMap.gapStatus) || undefined,
                            amsScorer: getVal(row, colMap.amsScorer) || undefined,
                            amsScoredOn: parseDate(getVal(row, colMap.amsScoredOn)),
                            projectStatus: getVal(row, colMap.projectStatus) || undefined,
                            tpoConfirmed: getVal(row, colMap.tpoConfirmed) || undefined,
                            tpoConfirmedOn: parseDate(getVal(row, colMap.tpoConfirmedOn)),
                            rescoreDate: parseDate(getVal(row, colMap.rescoreDate)),
                            comments: getVal(row, colMap.comments) || undefined
                        };
                        Object.assign(trackerFields, calculateTrackerFields(trackerFields));

                        const riskEntry = {
                            riskId: trackerFields.ricefw || getVal(row, colMap.riskId) || undefined,
                            riskTitle: trackerFields.wricefName || getVal(row, colMap.riskTitle) || 'Untitled Risk',
                            description: trackerFields.gapDescription || getVal(row, colMap.description) || undefined,
                            owner: trackerFields.fdOwnerNameKtPoc || getVal(row, colMap.owner) || undefined,
                            ownerEmail: getVal(row, colMap.ownerEmail) || undefined,
                            criticality: normalizeLevel(trackerFields.priority || getVal(row, colMap.criticality)),
                            complexity: normalizeLevel(getVal(row, colMap.complexity)),
                            riskSeverity: trackerFields.riskBand || getVal(row, colMap.riskSeverity) || undefined,
                            status: trackerFields.gapStatus || trackerFields.projectStatus || getVal(row, colMap.status) || 'Open',
                            dueDate: trackerFields.dueDate || parseDate(getVal(row, colMap.dueDate)),
                            comments: trackerFields.comments,
                            workstream_ID: workstreamId,
                            uploadBatch_ID: batchId,
                            country: trackerFields.release || getVal(row, colMap.country) || undefined,
                            serviceArea: trackerFields.scrumTeam || getVal(row, colMap.serviceArea) || undefined,
                            process: trackerFields.processFunction || getVal(row, colMap.process) || undefined,
                            subProcess: getVal(row, colMap.subProcess) || undefined,
                            riskCategory: trackerFields.ricefwType || getVal(row, colMap.riskCategory) || undefined,
                            criticalityReason: getVal(row, colMap.criticalityReason) || undefined,
                            ricefId: trackerFields.ricefw || getVal(row, colMap.ricefId) || undefined,
                            ricefDescription: trackerFields.commonObjects || getVal(row, colMap.ricefDescription) || undefined,
                            mitigationOwner: getVal(row, colMap.mitigationOwner) || undefined,
                            expectedRisk: getVal(row, colMap.expectedRisk) || undefined,
                            tpoReview: getVal(row, colMap.tpoReview) || undefined,
                            sapModule: getVal(row, colMap.sapModule) || undefined,
                            applicationArea: getVal(row, colMap.applicationArea) || undefined,
                            serviceNowGroup: getVal(row, colMap.serviceNowGroup) || undefined,
                            jiraComponent: getVal(row, colMap.jiraComponent) || undefined,
                            confluenceSpace: getVal(row, colMap.confluenceSpace) || undefined,
                            truVaultProjectId: getVal(row, colMap.truVaultProjectId) || undefined,
                            isActive: getVal(row, colMap.isActive) || undefined,
                            ...trackerFields
                        };

                        risks.push(riskEntry);

                        // Collect mitigation plan if present
                        const mitigation = getVal(row, colMap.mitigationPlan);
                        if (mitigation) {
                            mitigations.push({
                                _riskIndex: risks.length - 1,
                                description: mitigation,
                                owner: getVal(row, colMap.mitigationOwner) || undefined,
                                status: 'Open'
                            });
                        }

                        // Collect action item if present
                        const actionItem = getVal(row, colMap.actionItem);
                        if (actionItem) {
                            actions.push({
                                _riskIndex: risks.length - 1,
                                actionItem,
                                assignee: getVal(row, colMap.assignee) || undefined,
                                status: 'Open'
                            });
                        }
                    } catch (rowErr) {
                        errorCount++;
                        cds.log('heatmap').warn('Error parsing row:', rowErr.message);
                    }
                }

                if (replaceExisting && risks.length === 0) {
                    await UPDATE(UploadBatch, batchId).with({
                        status: 'Failed',
                        message: 'No valid Tracker rows were found; existing risk records were not changed.'
                    });
                    return req.error(400, 'No valid Tracker rows were found; existing risk records were not changed.');
                }

                if (replaceExisting) {
                    await DELETE.from(ActionTracker);
                    await DELETE.from(MitigationPlan);
                    await DELETE.from(Risk);
                }

                // Bulk insert risks
                if (risks.length > 0) {
                    await INSERT.into(Risk).entries(risks);

                    // Fetch inserted risks to get their IDs (for compositions)
                    const insertedRisks = await SELECT.from(Risk)
                        .where({ uploadBatch_ID: batchId })
                        .columns('ID', 'riskTitle')
                        .orderBy('createdAt asc');

                    // Insert mitigation plans
                    const mitEntries = mitigations
                        .filter(m => insertedRisks[m._riskIndex])
                        .map(m => ({
                            description: m.description,
                            owner: m.owner,
                            status: m.status,
                            risk_ID: insertedRisks[m._riskIndex].ID
                        }));
                    if (mitEntries.length > 0) {
                        await INSERT.into(MitigationPlan).entries(mitEntries);
                    }

                    // Insert action trackers
                    const actEntries = actions
                        .filter(a => insertedRisks[a._riskIndex])
                        .map(a => ({
                            actionItem: a.actionItem,
                            assignee: a.assignee,
                            status: a.status,
                            risk_ID: insertedRisks[a._riskIndex].ID
                        }));
                    if (actEntries.length > 0) {
                        await INSERT.into(ActionTracker).entries(actEntries);
                    }
                }

                // Update batch status
                await UPDATE(UploadBatch, batchId).with({
                    status: errorCount > 0 ? 'Completed with Errors' : 'Completed',
                    recordCount: risks.length,
                    errorCount,
                    message: `${replaceExisting ? 'Replaced existing risk records. ' : ''}Uploaded ${risks.length} risk(s). ${errorCount} row(s) had errors.`
                });

                return await SELECT.one.from(UploadBatch, batchId);

            } catch (err) {
                cds.log('heatmap').error('uploadExcel failed:', err);
                await UPDATE(UploadBatch, batchId).with({
                    status: 'Failed',
                    message: err.message
                });
                return req.error(500, `Upload failed: ${err.message}`);
            }
        });

        // ─── getDashboardKPIs Function ────────────────────────────────────────
        this.on('getDashboardKPIs', async () => {
            const [total, tier1, immediate, mitigation, monitor, controlled] = await Promise.all([
                SELECT.one.from(Risk).columns('count(*) as count'),
                SELECT.one.from(Risk).where({ tier: 'Tier 1' }).columns('count(*) as count'),
                SELECT.one.from(Risk).where({ heatMapStatus: 'Immediate action' }).columns('count(*) as count'),
                SELECT.one.from(Risk).where({ heatMapStatus: 'Mitigation required' }).columns('count(*) as count'),
                SELECT.one.from(Risk).where({ heatMapStatus: 'Monitor' }).columns('count(*) as count'),
                SELECT.one.from(Risk).where({ heatMapStatus: 'Controlled' }).columns('count(*) as count')
            ]);

            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const lastRefreshed = `${pad(now.getDate())} ${months[now.getMonth()]} ${now.getFullYear()}, ` +
                `${pad(now.getHours())}:${pad(now.getMinutes())} ${now.getHours() >= 12 ? 'PM' : 'AM'}`;

            return {
                totalRICEFs        : total?.count || 0,
                tier1Objects       : tier1?.count || 0,
                immediateAction    : immediate?.count || 0,
                mitigationRequired : mitigation?.count || 0,
                monitor            : monitor?.count || 0,
                controlled         : controlled?.count || 0,
                lastRefreshed : lastRefreshed
            };
        });

        // ─── getFilterOptions Function ────────────────────────────────────────
        this.on('getFilterOptions', async () => {
            const [countries, processes, categories] = await Promise.all([
                SELECT.from(Risk).columns('country').groupBy('country').orderBy('country'),
                SELECT.from(Risk).columns('process').groupBy('process').orderBy('process'),
                SELECT.from(Risk).columns('riskCategory').groupBy('riskCategory').orderBy('riskCategory')
            ]);
            return {
                countries     : countries.map(r => r.country).filter(Boolean),
                processes     : processes.map(r => r.process).filter(Boolean),
                riskCategories: categories.map(r => r.riskCategory).filter(Boolean)
            };
        });

        // ─── exportToExcel Bound Action ───────────────────────────────────────
        this.on('exportToExcel', 'Risk', async (req) => {
            const risks = await SELECT.from(Risk)
                .columns('riskId', 'riskTitle', 'owner', 'criticality',
                         'complexity', 'riskSeverity', 'status', 'dueDate', 'comments');

            const wsData = risks.map(r => ({
                'Risk ID'      : r.riskId || '',
                'Risk Title'   : r.riskTitle || '',
                'Owner'        : r.owner || '',
                'Criticality'  : r.criticality || '',
                'Complexity'   : r.complexity || '',
                'Risk Severity': r.riskSeverity || '',
                'Status'       : r.status || '',
                'Due Date'     : r.dueDate || '',
                'Comments'     : r.comments || ''
            }));

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, 'Risks');

            const buffer = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
            return buffer;
        });

        await super.init();

        // Load the bundled Tracker once at local server startup, before serving requests.
        if (!cds.env.profiles.includes('production')) {
            const fileName = 'BOOK.xlsx';
            const buffer = await readFile(new URL(`./data/${fileName}`, import.meta.url));
            await this.tx(async tx => {
                if (Risk.drafts) await cds.db.run(DELETE.from(Risk.drafts));
                await cds.db.run(DELETE.from(ActionTracker));
                await cds.db.run(DELETE.from(MitigationPlan));
                await cds.db.run(DELETE.from(Risk));
                await cds.db.run(DELETE.from(UploadBatch));
                await cds.db.run(DELETE.from(Workstream));
                const result = await tx.send('uploadExcel', {
                    fileContent: buffer.toString('base64'),
                    fileName,
                    replaceExisting: true
                });
                if (result.status !== 'Completed' || result.errorCount) {
                    throw new Error(`Startup Tracker import failed: ${result.message}`);
                }
                cds.log('heatmap').info(`Loaded ${result.recordCount} records from ${fileName}`);
            });
        }
    }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a mapping from semantic field names to actual Excel column headers.
 * Supports case-insensitive and partial matching.
 */
function buildColumnMap(headers) {
    const normalizedHeaders = headers.map(header => ({
        original: header,
        normalized: String(header).toLowerCase().replace(/[^a-z0-9]/g, '')
    }));
    const normalize = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const find = (...candidates) => {
        const normalizedCandidates = candidates.map(normalize);
        const exactMatch = normalizedHeaders.find(header => normalizedCandidates.includes(header.normalized));
        if (exactMatch) return exactMatch.original;

        for (const normalized of normalizedCandidates) {
            const match = normalizedHeaders.find(header => header.normalized.includes(normalized));
            if (match) return match.original;
        }
        return null;
    };

    const map = {
        epicJiraId: find('Epic JIRA ID'),
        processFunction: find('Process Function'),
        scrumTeam: find('Scrum Team'),
        ricefwType: find('RICEFW Type'),
        ricefw: find('RICEFW'),
        wricefName: find('WRICEF Name'),
        commonObjects: find('Common Objects'),
        newModifyExtend: find('NEW/Modify/Extend'),
        priority: find('Priority'),
        fdOwnerNameKtPoc: find('FD Owner Name / KT POC'),
        release: find('Release'),
        objectType: find('Object Type'),
        ktSessionId: find('KT Session ID'),
        ktDate: find('KT Date'),
        criticalityScore: find('Criticality (1–5)', 'Criticality (1-5)'),
        complexityScore: find('Complexity (1–5)', 'Complexity (1-5)'),
        tier1Override: find('Tier 1 Override (Y/N)'),
        riskBand: find('Risk Band'),
        p1Monitoring: find('P1 Monitoring & Observability'),
        p2ExceptionHandling: find('P2 Exception & Error Handling'),
        p3Supportability: find('P3 Supportability'),
        p4KnowledgeReadiness: find('P4 Knowledge & AMS Readiness'),
        p5PreventionRecovery: find('P5 Prevention & Recovery'),
        p6SecurityAccess: find('P6 Security & Access'),
        readinessAverage: find('Readiness Avg'),
        lowestPillar: find('Lowest Pillar'),
        weakestLinkCap: find('Weakest-Link Cap'),
        readinessBand: find('Readiness Band'),
        heatMapStatus: find('Heat Map Status'),
        gapDescription: find('Gap Description'),
        action: find('Action'),
        projectOwner: find('Project Owner'),
        gapStatus: find('Gap Status'),
        amsScorer: find('AMS Scorer'),
        amsScoredOn: find('AMS Scored On'),
        projectResponseDue: find('Project Response Due'),
        projectStatus: find('Project Status'),
        effectiveProjectStatus: find('Effective Project Status'),
        tpoConfirmed: find('TPO Confirmed (Y/N)'),
        tpoConfirmedOn: find('TPO Confirmed On'),
        rescoreDate: find('Rescore Date'),
        riskId: find('Risk ID', 'RICEFW', 'RICEF ID', 'ID', 'Risk No'),
        riskTitle: find('WRICEF Name', 'Risk Description', 'Risk Title', 'Title', 'Name'),
        description: find('Gap Description', 'Description', 'Details', 'Risk Detail'),
        owner: find('FD Owner Name / KT POC', 'Risk Owner', 'Owner', 'Responsible'),
        ownerEmail: find('Owner Email', 'Email'),
        workstream: find('Scrum Team', 'Workstream', 'Work Stream', 'Stream', 'Domain'),
        criticality: find('Priority', 'Criticality', 'Criticality Level', 'Critical'),
        complexity: find('Complexity'),
        riskSeverity: find('Risk Band', 'Severity Score', 'Risk Severity', 'Severity'),
        status: find('Effective Project Status', 'Project Status', 'Gap Status', 'Risk Status', 'Status', 'State'),
        dueDate: find('Due Date', 'Deadline', 'Target Date'),
        comments: find('Comments', 'Comment', 'Notes', 'Remarks'),
        mitigationPlan: find('Mitigation Plan', 'Mitigation Description'),
        mitigationOwner: find('Mitigation Owner'),
        actionItem: find('Action Item', 'Action Description'),
        assignee: find('Assignee', 'Assigned To', 'Action Owner'),
        country: find('Release', 'Country', 'Country Name'),
        serviceArea: find('Scrum Team', 'Service Area', 'Service Line'),
        process: find('Process Function', 'Process Name', 'Process'),
        subProcess: find('Sub Process', 'Subprocess Name'),
        riskCategory: find('RICEFW Type', 'Risk Category', 'Category', 'Risk Type'),
        criticalityReason: find('Criticality Reason', 'Reason'),
        ricefId: find('RICEFW', 'RICEF ID', 'RICEF No'),
        ricefDescription: find('Common Objects', 'RICEF Description', 'RICEF Desc'),
        expectedRisk: find('Expected Risk', 'Residual Risk'),
        tpoReview: find('TPO Review'),
        sapModule: find('SAP Module', 'Module'),
        applicationArea: find('Application Area', 'App Area'),
        serviceNowGroup: find('ServiceNow Group', 'ServiceNow'),
        jiraComponent: find('Jira Component'),
        confluenceSpace: find('Confluence Space', 'Confluence'),
        truVaultProjectId: find('TruVault Project ID', 'TruVault'),
        isActive: find('Is Active', 'Active')
    };

    return map;
}

function calculateTrackerFields(fields) {
    const score = fields.criticalityScore !== undefined && fields.complexityScore !== undefined
        ? fields.criticalityScore * fields.complexityScore
        : undefined;
    const riskBand = score === undefined ? undefined
        : score >= 20 ? 'Critical'
            : score >= 15 ? 'High'
                : score >= 8 ? 'Moderate' : 'Low';
    const tierOverride = String(fields.tier1Override || '').toUpperCase() === 'Y';
    const tier = score === undefined ? undefined
        : score >= 15 || tierOverride ? 'Tier 1'
            : score >= 8 ? 'Tier 2' : 'Tier 3';

    const pillarScores = [
        fields.p1Monitoring,
        fields.p2ExceptionHandling,
        fields.p3Supportability,
        fields.p4KnowledgeReadiness,
        fields.p5PreventionRecovery,
        fields.p6SecurityAccess
    ];
    const hasAllPillarScores = pillarScores.every(value => value !== undefined);
    const readinessAverage = hasAllPillarScores
        ? Math.round(pillarScores.reduce((sum, value) => sum + value, 0) / pillarScores.length * 10) / 10
        : undefined;
    const lowestPillar = hasAllPillarScores ? Math.min(...pillarScores) : undefined;
    const readinessBand = readinessAverage === undefined ? undefined
        : readinessAverage < 3 ? 'Low'
            : readinessAverage >= 4 && lowestPillar > 2 ? 'High' : 'Medium';

    let heatMapStatus;
    if (riskBand && readinessBand) {
        if (riskBand === 'Critical' || riskBand === 'High') {
            heatMapStatus = readinessBand === 'Low' ? 'Immediate action'
                : readinessBand === 'Medium' ? 'Mitigation required' : 'Controlled';
        } else if (riskBand === 'Moderate') {
            heatMapStatus = readinessBand === 'Low' ? 'Mitigation required'
                : readinessBand === 'Medium' ? 'Monitor' : 'Controlled';
        } else {
            heatMapStatus = readinessBand === 'Low' ? 'Monitor' : 'Controlled';
        }
    }

    const projectResponseDue = addWorkdays(fields.amsScoredOn, 3);
    const today = new Date().toISOString().slice(0, 10);
    const effectiveProjectStatus = fields.projectStatus
        ? fields.projectStatus === 'Pending' && projectResponseDue && today > projectResponseDue
            ? 'Deemed confirmed' : fields.projectStatus
        : undefined;

    return {
        riskScore: score,
        riskBand,
        tier,
        readinessAverage,
        lowestPillar,
        weakestLinkCap: lowestPillar === undefined ? undefined : lowestPillar <= 2 ? 'Yes' : 'No',
        readinessBand,
        heatMapStatus,
        projectResponseDue,
        effectiveProjectStatus
    };
}

function addWorkdays(dateValue, workdays) {
    if (!dateValue) return undefined;
    const date = new Date(`${dateValue}T00:00:00Z`);
    let remaining = workdays;
    while (remaining > 0) {
        date.setUTCDate(date.getUTCDate() + 1);
        const day = date.getUTCDay();
        if (day !== 0 && day !== 6) remaining--;
    }
    return date.toISOString().slice(0, 10);
}

/**
 * Safely get a value from a row using a potentially-null column key.
 */
function getVal(row, colKey) {
    if (!colKey) return '';
    const val = row[colKey];
    return val !== undefined && val !== null ? String(val).trim() : '';
}

function parseNumber(val) {
    if (val === undefined || val === null || val === '') return undefined;
    const number = Number(String(val).replace(/,/g, '').trim());
    return Number.isFinite(number) ? number : undefined;
}

/**
 * Normalize risk level strings to canonical values.
 */
function normalizeLevel(val) {
    if (val === undefined || val === null || val === '') return undefined;
    // Handle numeric scale 1-5 (1=Critical/highest, 5=Low/lowest)
    const n = Number(val);
    if (!isNaN(n)) {
        if (n >= 5) return 'Critical';
        if (n === 4) return 'High';
        if (n === 3) return 'Medium';
        if (n === 2) return 'Low';
        if (n === 1) return 'Low';
        return String(val);
    }
    const v = String(val).toLowerCase().trim();
    if (v.includes('critical') || v === 'very high') return 'Critical';
    if (v.includes('high'))     return 'High';
    if (v.includes('medium') || v.includes('med')) return 'Medium';
    if (v.includes('low'))      return 'Low';
    return String(val); // return as-is if no match
}

/**
 * Parse various date formats into ISO date string (YYYY-MM-DD).
 */
function parseDate(val) {
    if (!val) return undefined;
    if (val instanceof Date) {
        return val.toISOString().split('T')[0];
    }
    const str = String(val).trim();
    if (!str) return undefined;
    // Try parsing as a date
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
    }
    return undefined;
}

/**
 * Parse boolean-like values from Excel (true/false/yes/no/1/0/x).
 * Returns true, false, or undefined if not recognisable.
 */
function parseBoolean(val) {
    if (val === undefined || val === null || val === '') return undefined;
    const v = String(val).toLowerCase().trim();
    if (v === 'true' || v === 'yes' || v === '1' || v === 'x' || v === 'y') return true;
    if (v === 'false' || v === 'no' || v === '0' || v === 'n') return false;
    return undefined;
}
