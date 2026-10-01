# Project Brain

## Purpose

This repository contains a SAP Cloud Application Programming Model (CAP) service and two SAPUI5 applications for managing and analyzing risks:

- Risk Heatmap Dashboard: custom UI5 dashboard with KPI summaries, filters, a Risk Band × Readiness Band heatmap, risk distribution, and navigation to risk details.
- Risk List: SAP Fiori elements list/object pages for the RICEF operational readiness tracker, including the 46-column Excel Tracker import.

The local application shell resembles a Fiori Launchpad. It is a development sandbox, not the production SAP Build Work Zone/Launchpad runtime and not an authentication boundary.

## Architecture

- `db/schema.cds`: CAP data model, risk entities, analytical views, and value helps.
- `srv/heatmap-service.cds`: OData V4 service contract at `/heatmap/`.
- `srv/heatmap-service.js`: service handlers, KPI/filter functions, Excel upload, and server-side calculation of workbook-derived risk/readiness fields.
- `app/jnj.com.heatmap.dashboard/`: standalone UI5 dashboard. Main behavior is in `webapp/controller/` and `webapp/view/`; the heatmap groups by `riskBand` and `readinessBand`, combining Critical and High in one display row.
- `app/jnj.com.heatmap.risklist/`: standalone Fiori elements risk-list application. UI configuration is primarily in `webapp/manifest.json`; custom behavior is in `webapp/ext/`.
- `app/index.html`, `app/appconfig/`: local FLP sandbox shell and local tile/inbound configuration.
- `server.js`: CAP server customization for local UI5 framework resources and sandbox support.
- `test/data/`: CSV fixtures/sample data. Do not assume these are automatically deployed as production records.
- Root `package.json`: CAP runtime dependencies and production profile settings.

Both UI5 apps use the relative OData URL `/heatmap/`. Preserve that contract unless routing and deployment configuration are deliberately updated in tandem. Their manifest inbounds are `RiskHeatmap-display` and `RiskList-manage`.

The Excel importer prefers the workbook's `Tracker` worksheet, persists its columns, and recalculates formula columns because cached formula values can be blank. `Risk` retains legacy fields as compatibility aliases. Uploads append records; they do not replace existing records.

## Runtime And Authentication

- Local development uses the CAP `dummy` auth profile and SQLite/dev configuration.
- CAP's JSON body parser is configured to 10 MB to match the Excel upload limit.
- The root production profile selects HANA and XSUAA.
- `xs-security.json` currently has empty scopes and role templates. Add roles and CAP authorization annotations before treating the production app as access-controlled.
- Production deployment packaging is not yet present: there is no root `mta.yaml` or production `xs-app.json` in the repository as currently mapped.
- Do not present the local sandbox, its permissive local configuration, or `server.js` sandbox middleware as production FLP or production security.

## Development Commands

From the repository root:

```sh
npm install
npm run setup:ui5
cds watch
```

The root README documents opening the local shell at `http://localhost:4004`.

Each UI5 app has its own package and lock file. From either app directory:

```sh
npm install
npm run build
npm run lint
```

Use the app's `npm test` script when the appropriate browser/Karma prerequisites are available. Check the current package scripts before relying on these commands.

## Change Guidelines

1. Read this file at the start of each project task, then inspect the current implementation and configuration files relevant to the request. This document is a map, not a substitute for source code.
2. Check for current user edits before changing files. Keep changes scoped to the owning app/service and preserve the existing UI5/CAP patterns.
3. When changing service fields or analytical views, update the CDS model, service projection, consumers, and relevant tests/data together. Run a CAP build or focused test to catch contract mismatches.
4. When changing an app's OData calls or navigation, verify the service URL and manifest inbound/intent. If production routing is involved, update and test the approuter/destination configuration as well.
5. Keep generated directories (`gen/`, `dist/`), `node_modules/`, and local database files out of manual source edits unless the task explicitly concerns generated output.
6. Never put credentials, tokens, customer data, or production secrets in source control.
7. Distinguish verified repository facts from assumptions about BTP account entitlements, region, identity provider, and Work Zone configuration.

## Known Items To Verify Before Production

- Local development seeds legacy example risks from `test/data/`; workbook uploads append their records. Do not delete existing data during upload unless replacement behavior is explicitly requested.
- Define a role model and add server-side CAP authorization; frontend visibility alone is not authorization.
- Decide how production HANA data is initialized and backed up; sample CSV fixtures are not a production migration plan.
- Add and review MTA, HTML5 Applications Repository, destination, and authenticated routing configuration before deployment.
