import cds from '@sap/cds';
import path from 'path';
import fs from 'fs';
import os from 'node:os';
import { fileURLToPath } from 'url';
import { Builder as LessBuilder } from 'less-openui5';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// UI5 framework base path (populated by @ui5/cli when running ui5 serve or ui5 build)
const UI5_FRAMEWORK_BASE = path.join(os.homedir(), '.ui5', 'framework', 'packages');

/**
 * Build an index of { libName → { main: srcPath, test: testPath } } from the
 * UI5 framework cache so that resource requests can be resolved quickly.
 */
function buildUi5LibIndex() {
    const index = {}; // libName (e.g. "sap.ushell") → { main, test }
    const orgs = ['@sapui5', '@openui5'];
    for (const org of orgs) {
        const orgDir = path.join(UI5_FRAMEWORK_BASE, org);
        let pkgs;
        try { pkgs = fs.readdirSync(orgDir); } catch { continue; }
        for (const pkg of pkgs) {
            const versionDir = path.join(orgDir, pkg);
            let versions;
            try { versions = fs.readdirSync(versionDir); } catch { continue; }
            // Use the first (and typically only) version
            for (const ver of versions) {
                const mainJs = path.join(versionDir, ver, 'src', 'main', 'js');
                const testJs = path.join(versionDir, ver, 'src', 'test', 'js');
                const srcRoot = path.join(versionDir, ver, 'src');
                index[pkg] = {
                    main: fs.existsSync(mainJs) ? mainJs : (fs.existsSync(srcRoot) ? srcRoot : null),
                    // Additional base under `src/` used for theme/less resources
                    // and other assets that live outside `src/main/js`
                    // (e.g. `src/sap/m/themes/sap_horizon/library.source.less`).
                    srcRoot: fs.existsSync(srcRoot) ? srcRoot : null,
                    test: fs.existsSync(testJs) ? testJs : null
                };
                break; // only first version
            }
        }
    }
    return index;
}

const UI5_LIB_INDEX = buildUi5LibIndex();

// Distinct source roots across all indexed packages — used as @import lookup
// paths by the on-demand less-openui5 theme compiler. We include both `src/`
// (used by @openui5 packages like themelib_sap_horizon and sap.m) and
// `src/main/js/` (used by @sapui5 packages like sap.ushell) so themes in
// either layout can be resolved.
const UI5_SRC_ROOTS = Array.from(new Set([
    ...Object.values(UI5_LIB_INDEX).map(p => p.main).filter(Boolean),
    ...Object.values(UI5_LIB_INDEX).map(p => p.srcRoot).filter(Boolean)
]));

// Shared less-openui5 Builder instance with internal caching keyed by
// library.source.less path. Repeated requests for the same theme are served
// from cache; edits to the .less files trigger a rebuild automatically.
const themeBuilder = new LessBuilder();

// Map of URL basename → property on the less-openui5 build result.
const THEME_ARTEFACTS = {
    'library.css':          { key: 'css',          type: 'text/css; charset=utf-8' },
    'library-RTL.css':      { key: 'cssRtl',       type: 'text/css; charset=utf-8' },
    'library-parameters.json': { key: 'variables', type: 'application/json; charset=utf-8', json: true }
};

/**
 * Find the on-disk path of a file requested via /resources/<relPath> or
 * /test-resources/<relPath>. Returns null when nothing matches.
 */
function resolveResourcePath(relPath, useTestResources) {
    // sandbox.js (deprecated) is only shipped under the test tree; sandbox2.js is in main.
    const searchTestToo = !useTestResources && relPath === 'sap/ushell/bootstrap/sandbox.js';

    for (const paths of Object.values(UI5_LIB_INDEX)) {
        const bases = [];
        if (useTestResources) {
            if (paths.test) bases.push(paths.test);
        } else {
            if (paths.main) bases.push(paths.main);
            // Theme content, .less, i18n .properties etc. live directly under `src/`.
            if (paths.srcRoot && paths.srcRoot !== paths.main) bases.push(paths.srcRoot);
            if (searchTestToo && paths.test) bases.push(paths.test);
        }
        for (const srcBase of bases) {
            const candidate = path.join(srcBase, relPath);
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                return candidate;
            }
        }
    }
    return null;
}

/**
 * Serve a theme artefact (library.css / library-RTL.css / library-parameters.json)
 * by compiling library.source.less with less-openui5 at request time.
 * The compiled output is cached inside the Builder keyed by input path.
 */
async function serveThemeArtefact(themeDir, filename, artefact, res, next) {
    try {
        const lessRel = themeDir + '/library.source.less';
        const lessAbs = resolveResourcePath(lessRel, false);
        if (!lessAbs) return next();

        const result = await themeBuilder.build({
            lessInputPath: lessRel,      // POSIX-style, relative to a rootPath
            rootPaths: UI5_SRC_ROOTS,    // @import lookup roots
            rtl: artefact.key === 'cssRtl'
        });

        const payload = artefact.json
            ? JSON.stringify(result[artefact.key] || {})
            : (result[artefact.key] || '');

        res.setHeader('Content-Type', artefact.type);
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.end(payload);
    } catch (err) {
        // Log but don't crash the server — fall through to next() so a plain 404 is returned.
        console.warn(`[ui5-theme] failed to compile ${themeDir}/${filename}: ${err.message}`);
        next();
    }
}

/**
 * Serve SAPUI5 framework resources locally so that sap/ushell/bootstrap/sandbox.js
 * and library themes are available without needing the public CDN (which does not
 * host sap.ushell or other SAP-internal libraries).
 *
 * URL pattern: /resources/<rel>       → ~/.ui5/framework/packages/@(openui5|sapui5)/<lib>/src/[main/js/]<rel>
 * URL pattern: /test-resources/<rel>  → same packages, src/test/js/<rel>
 * Special:      /resources/sap-ui-version.json      → synthetic response
 *               /resources/<themeDir>/library.css   → compiled from library.source.less
 */
function ui5FrameworkMiddleware(req, res, next) {
    const urlPath = req.path;

    let relPath = null;
    let useTestResources = false;

    if (urlPath.startsWith('/resources/')) {
        relPath = urlPath.slice('/resources/'.length);
    } else if (urlPath.startsWith('/test-resources/')) {
        relPath = urlPath.slice('/test-resources/'.length);
        useTestResources = true;
    } else {
        return next();
    }

    // Synthetic /resources/sap-ui-version.json so VersionInfo.load() does not 404.
    // Raw framework packages do not ship this file (it is generated by `ui5 build`).
    if (!useTestResources && relPath === 'sap-ui-version.json') {
        const libs = Object.keys(UI5_LIB_INDEX).map(n => ({ name: n }));
        return res.type('application/json').send(JSON.stringify({
            name: 'SAPUI5 Distribution',
            version: '1.152.0',
            buildTimestamp: new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12),
            scmRevision: '',
            libraries: libs
        }));
    }

    // Theme artefacts: compile library.source.less on demand.
    if (!useTestResources) {
        const themeMatch = /^(sap\/.+\/themes\/[^/]+)\/(library\.css|library-RTL\.css|library-parameters\.json)$/.exec(relPath);
        if (themeMatch) {
            const [, themeDir, filename] = themeMatch;
            return serveThemeArtefact(themeDir, filename, THEME_ARTEFACTS[filename], res, next);
        }
    }

    const abs = resolveResourcePath(relPath, useTestResources);
    if (abs) {
        return res.sendFile(path.basename(abs), {
            root: path.dirname(abs),
            headers: { 'Cache-Control': 'public, max-age=3600' }
        }, (err) => { if (err && !res.headersSent) next(err); });
    }

    next();
}

// Suppress FLP telemetry and SAPUI5 Flexibility (lrep) 404 noise in local dev
cds.on('bootstrap', (app) => {
    // Serve SAPUI5 framework resources (including sap.ushell) from local UI5 cache
    app.use(ui5FrameworkMiddleware);

    // Serve FLP sandbox config — sandbox2.js tries /appconfig/fioriSandboxConfig.json
    // and ../appconfig/fioriSandboxConfig.json; serve the file from app/appconfig/.
    const sandboxConfigPath = path.join(__dirname, 'app', 'appconfig', 'fioriSandboxConfig.json');
    app.use((req, res, next) => {
        if (req.method === 'GET' && req.path === '/appconfig/fioriSandboxConfig.json') {
            return res.sendFile(sandboxConfigPath, (err) => { if (err && !res.headersSent) next(err); });
        }
        next();
    });

    // Absorb FLP telemetry probes (POST /sap/bc/ui2/flp;sap-metrics-only)
    // The semicolon suffix is stripped by Express into req.path, so we use middleware
    app.use((req, res, next) => {
        const url = req.originalUrl || req.url;
        // FLP telemetry probe: POST /sap/bc/ui2/flp;sap-metrics-only
        if (req.method === 'POST' && url.startsWith('/sap/bc/ui2/flp')) {
            return res.status(200).end();
        }
        // lrep flex data: GET /sap/bc/lrep/flex/data/<appId>
        if (req.method === 'GET' && url.startsWith('/sap/bc/lrep/flex/data/')) {
            return res.status(200).json({ changes: [], variantSection: {} });
        }
        // lrep flex settings: GET /sap/bc/lrep/flex/settings
        if (req.method === 'GET' && url.startsWith('/sap/bc/lrep/flex/settings')) {
            return res.status(200).json({ isKeyUser: false, isVersioningEnabled: false, isContextSharingEnabled: false });
        }
        next();
    });
});

export default cds.server;
