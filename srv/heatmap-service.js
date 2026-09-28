import cds from '@sap/cds';
import XLSX from 'xlsx';

export default class HeatmapService extends cds.ApplicationService {

    async init() {
        const { Risk, MitigationPlan, ActionTracker, Workstream,
                UploadBatch, HeatmapSummary, WorkstreamAnalytics } = this.entities;

        // ─── uploadExcel Action ───────────────────────────────────────────────
        this.on('uploadExcel', async (req) => {
            const { fileContent, fileName } = req.data;

            if (!fileContent) {
                return req.error(400, 'No file content provided');
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

                const sheetName = workbook.SheetNames[0];
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
                        const wsName = getVal(row, colMap.workstream);
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

                        const riskEntry = {
                            riskId            : getVal(row, colMap.riskId)            || undefined,
                            riskTitle         : getVal(row, colMap.riskTitle)         || 'Untitled Risk',
                            description       : getVal(row, colMap.description)       || undefined,
                            owner             : getVal(row, colMap.owner)             || undefined,
                            ownerEmail        : getVal(row, colMap.ownerEmail)        || undefined,
                            criticality       : normalizeLevel(getVal(row, colMap.criticality)),
                            complexity        : normalizeLevel(getVal(row, colMap.complexity)),
                            riskSeverity      : normalizeLevel(getVal(row, colMap.riskSeverity)),
                            status            : getVal(row, colMap.status)            || 'Open',
                            dueDate           : parseDate(getVal(row, colMap.dueDate)),
                            comments          : getVal(row, colMap.comments)          || undefined,
                            workstream_ID     : workstreamId,
                            uploadBatch_ID    : batchId,
                            // Extra fields
                            country           : getVal(row, colMap.country)           || undefined,
                            serviceArea       : getVal(row, colMap.serviceArea)       || undefined,
                            process           : getVal(row, colMap.process)           || undefined,
                            subProcess        : getVal(row, colMap.subProcess)        || undefined,
                            riskCategory      : getVal(row, colMap.riskCategory)      || undefined,
                            criticalityReason : getVal(row, colMap.criticalityReason) || undefined,
                            ricefId           : getVal(row, colMap.ricefId)           || undefined,
                            ricefDescription  : getVal(row, colMap.ricefDescription)  || undefined,
                            expectedRisk      : getVal(row, colMap.expectedRisk)      || undefined,
                            tpoReview         : getVal(row, colMap.tpoReview)         || undefined,
                            sapModule         : getVal(row, colMap.sapModule)         || undefined,
                            applicationArea   : getVal(row, colMap.applicationArea)   || undefined,
                            serviceNowGroup   : getVal(row, colMap.serviceNowGroup)   || undefined,
                            jiraComponent     : getVal(row, colMap.jiraComponent)     || undefined,
                            confluenceSpace   : getVal(row, colMap.confluenceSpace)   || undefined,
                            truVaultProjectId : getVal(row, colMap.truVaultProjectId) || undefined,
                            isActive          : getVal(row, colMap.isActive) || undefined
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
                    message: `Uploaded ${risks.length} risk(s). ${errorCount} row(s) had errors.`
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
            const [total, highSev, openInc, mitigated, closedInc] = await Promise.all([
                SELECT.one.from(Risk).columns('count(*) as count'),
                SELECT.one.from(Risk).where({ criticality: 'High' }).columns('count(*) as count'),
                SELECT.one.from(Risk).where({ status: 'Open' }).columns('count(*) as count'),
                SELECT.one.from(Risk).where({ status: 'Mitigated' }).columns('count(*) as count'),
                SELECT.one.from(Risk).where({ status: 'Closed' }).columns('count(*) as count')
            ]);

            const totalCount  = total?.count    || 0;
            const highCount   = highSev?.count  || 0;
            const openCount   = openInc?.count  || 0;
            const mitCount    = mitigated?.count || 0;
            const closedCount = closedInc?.count || 0;
            const resolvedCount = mitCount + closedCount;
            const onTrackPct  = totalCount > 0
                ? Math.round((resolvedCount / totalCount) * 100)
                : 0;

            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const lastRefreshed = `${pad(now.getDate())} ${months[now.getMonth()]} ${now.getFullYear()}, ` +
                `${pad(now.getHours())}:${pad(now.getMinutes())} ${now.getHours() >= 12 ? 'PM' : 'AM'}`;

            return {
                totalRisks    : totalCount,
                highSeverity  : highCount,
                openIncidents : openCount,
                onTrackPct    : onTrackPct,
                totalTrend    : 12,
                highTrend     : 29,
                openTrend     : 8,
                onTrackTrend  : 6,
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
    }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a mapping from semantic field names to actual Excel column headers.
 * Supports case-insensitive and partial matching.
 */
function buildColumnMap(headers) {
    const map = {};
    const lower = headers.map(h => ({ original: h, lower: h.toLowerCase().replace(/[\s_\-\.]/g, '') }));

    const find = (...candidates) => {
        for (const candidate of candidates) {
            const c = candidate.toLowerCase().replace(/[\s_\-\.]/g, '');
            const found = lower.find(h => h.lower === c || h.lower.includes(c));
            if (found) return found.original;
        }
        return null;
    };

    // Core fields
    map.riskId             = find('riskid', 'risk id', 'ricefid', 'ricef id', 'id', 'riskno');
    map.riskTitle          = find('riskdescription', 'risk description', 'risktitle', 'risk title', 'title', 'name');
    map.description        = find('description', 'details', 'riskdetail');
    map.owner              = find('owner', 'riskowner', 'risk owner', 'responsible');
    map.ownerEmail         = find('owneremail', 'email', 'owner email');
    map.workstream         = find('workstream', 'work stream', 'stream', 'domain');
    map.criticality        = find('criticality', 'criticalitylevel', 'critical');
    map.complexity         = find('complexity', 'complexitylevel', 'complex');
    map.riskSeverity       = find('severityscore', 'riskseverity', 'risk severity', 'severity', 'severitylevel');
    map.status             = find('status', 'riskstatus', 'risk status', 'state');
    map.dueDate            = find('duedate', 'due date', 'deadline', 'targetdate', 'target date');
    map.comments           = find('comments', 'comment', 'notes', 'remarks');
    map.mitigationPlan     = find('mitigationplan', 'mitigation plan', 'mitigation', 'mitigationdescription');
    map.mitigationOwner    = find('mitigationowner', 'mitigation owner');
    map.actionItem         = find('actionitem', 'action item', 'actiondescription');
    map.assignee           = find('assignee', 'assigned to', 'actionowner', 'action owner');
    // Extra fields — exact Excel header names first, then fallbacks
    map.country            = find('country', 'countryname', 'country name');
    map.serviceArea        = find('servicearea', 'service area', 'serviceline');
    map.process            = find('process', 'processname', 'process name');
    map.subProcess         = find('subprocess', 'sub process', 'subprocessname');
    map.riskCategory       = find('riskcategory', 'risk category', 'category', 'risktype');
    map.criticalityReason  = find('criticalityreason', 'criticality reason', 'reason');
    map.ricefId            = find('ricef id', 'ricefid', 'ricef', 'ricefno', 'ricef_id');
    map.ricefDescription   = find('ricefdescription', 'ricef description', 'ricefdesc');
    map.expectedRisk       = find('expectedrisk', 'expected risk', 'residualrisk');
    map.tpoReview          = find('tporeview', 'tpo review', 'tpo');
    map.sapModule          = find('sapmodule', 'sap module', 'module');
    map.applicationArea    = find('applicationarea', 'application area', 'apparea');
    map.serviceNowGroup    = find('servicenowgroup', 'servicenow group', 'servicenow');
    map.jiraComponent      = find('jiracomponent', 'jira component', 'jira');
    map.confluenceSpace    = find('confluencespace', 'confluence space', 'confluence');
    map.truVaultProjectId  = find('truvaultprojectid', 'truvault project id', 'truvault');
    map.isActive           = find('isactive', 'is active', 'active');

    return map;
}

/**
 * Safely get a value from a row using a potentially-null column key.
 */
function getVal(row, colKey) {
    if (!colKey) return '';
    const val = row[colKey];
    return val !== undefined && val !== null ? String(val).trim() : '';
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
