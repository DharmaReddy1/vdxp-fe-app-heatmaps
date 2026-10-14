# RICEFW Heatmap — SAP BTP Deployment and Operations Guide

Prepared: 14 October 2026. Commands in this document are for the Linux terminal in SAP Business Application Studio (BAS).

## 1. Scope and current status

This guide covers account preparation, CAP/HANA deployment, SAPUI5 packaging, Work Zone application tiles, user access, database inspection, updates, and troubleshooting.

The deployment in the conversation completed successfully in a **trial subaccount**, organization `c504766ftrial`, space `dev`. That is a working cloud deployment; business production requires an appropriate licensed environment, configured permissions, backups, and operational ownership. Work Zone embedding and blank-page issues were discussed but were not confirmed resolved. Treat those checks as outstanding until tested.

The Windows workspace and the project in BAS are separate copies. Changes made in one do not automatically reach the other. Transfer changes through your repository or copy the updated files into BAS before building.

### Environment reference

| Item | Value |
|---|---|
| MTA ID | `vdxp-fe-app-heatmap` |
| Backend | `vdxp-fe-app-heatmap-srv` |
| Router | `vdxp-fe-app-heatmap` |
| Database deployer | `vdxp-fe-app-heatmap-db-deployer` |
| HDI service | `vdxp-fe-app-heatmap-db` |
| Authentication service | `vdxp-fe-app-heatmap-auth` |
| BAS project observed | `/home/user/projects/vdxp-fe-app-heatmaps` |
| Router directory in supplied MTA | `.deploy/app-router` |
| Backend destination | `srv-api` |

Router origin:

```text
https://c504766ftrial-dev-vdxp-fe-app-heatmap.cfapps.us10-001.hana.ondemand.com
```

Dashboard:

```text
https://c504766ftrial-dev-vdxp-fe-app-heatmap.cfapps.us10-001.hana.ondemand.com/jnj.com.heatmap.dashboard/webapp/index.html
```

List:

```text
https://c504766ftrial-dev-vdxp-fe-app-heatmap.cfapps.us10-001.hana.ondemand.com/jnj.com.heatmap.risklist/webapp/index.html
```

Replace trial values when deploying to another environment. Do not store passwords, service keys, or authentication tokens in this document or Git.

## 2. Prepare SAP BTP

1. Create/select a subaccount in BTP Cockpit.
2. Enable Cloud Foundry and create the deployment space.
3. Assign the deployer Space Developer access.
4. Allocate entitlements for Cloud Foundry runtime, SAP HANA Cloud, HANA `hdi-shared`, and XSUAA `application`.
5. Subscribe to BAS and grant its developer role.
6. Subscribe to SAP Build Work Zone, standard edition, if launchpad tiles are required.
7. Create/start a HANA Cloud database and make it available to the intended Cloud Foundry organization/space.

Find the Cloud Foundry API endpoint at **Subaccount → Overview → Cloud Foundry Environment → API Endpoint**. Copy it rather than deriving it from the application URL.

For business production, use an approved production subaccount/space, identity provider, and database. Plan backups and restore procedures before importing business data.

## 3. Prepare BAS and source code

1. Create a Full Stack Cloud Application dev space in BAS.
2. Upload or clone the entire project.
3. Open a terminal at the root containing `package.json`.

```bash
cd /home/user/projects/vdxp-fe-app-heatmaps
pwd
ls
npm install -g @sap/cds-dk mbt
npm ci
npm --prefix app/jnj.com.heatmap.dashboard ci
npm --prefix app/jnj.com.heatmap.risklist ci
cds --version
mbt --version
cf version
```

Use a Node.js version supported by the installed CAP and UI5 tooling. Keep dependency lock files in source control.

If `npm ci` reports a package missing from the lock file, run `npm install` in the affected package directory, then `npm ci` again. Save the updated lock file. Keep `npm ci` in repeatable deployment builds.

## 4. Prepare the backend for production

The project has production settings for HANA and XSUAA in the root `package.json`. Check that they remain configured:

```json
"[production]": {
  "db": "hana",
  "auth": "xsuaa"
}
```

For a project without deployment files, generate them once:

```bash
cds add hana
cds add xsuaa
cds add mta
cds add approuter
```

If the files already exist, review them instead of replacing working configuration. Generated router paths vary; this project's supplied MTA uses `.deploy/app-router`.

### Production server bootstrap

The deployed backend crashed because the original `server.js` imported `less-openui5`, a local UI5 development dependency. The successful BAS deployment used:

```js
import cds from '@sap/cds';

export default cds.server;
```

Use this minimal root `server.js` for the standalone router deployment when no other custom server bootstrap is needed. Preserve any genuinely required custom backend middleware if you add it later. Keep local UI5 cache/theme middleware development-only.

Check the generated backend after building:

```bash
node --check server.js
npx cds build --production
cat gen/srv/server.js
```

Do not edit `gen/srv/server.js` as the source fix; a subsequent build regenerates it.

## 5. Package both UI applications

In `mta.yaml`, use these root-level before-all commands. They build both UIs, recreate the router's generated static resources to remove stale files, and build CAP.

```yaml
build-parameters:
  before-all:
    - builder: custom
      commands:
        - npm ci
        - npm --prefix app/jnj.com.heatmap.dashboard ci
        - npm --prefix app/jnj.com.heatmap.risklist ci
        - npm --prefix app/jnj.com.heatmap.dashboard run build
        - npm --prefix app/jnj.com.heatmap.risklist run build
        - node -e "require('node:fs').rmSync('.deploy/app-router/resources', { recursive: true, force: true })"
        - mkdir -p .deploy/app-router/resources/jnj.com.heatmap.dashboard/webapp
        - mkdir -p .deploy/app-router/resources/jnj.com.heatmap.risklist/webapp
        - cp -R app/jnj.com.heatmap.dashboard/dist/. .deploy/app-router/resources/jnj.com.heatmap.dashboard/webapp/
        - cp -R app/jnj.com.heatmap.risklist/dist/. .deploy/app-router/resources/jnj.com.heatmap.risklist/webapp/
        - npx cds build --production
```

The cleanup assumes `resources` contains only generated UI assets. Store manually maintained files elsewhere or adjust the build accordingly.

Ensure the router package declares `@sap/approuter` in runtime dependencies, has a valid start script, and includes `resources` in its deployment artifact. Keep its package-lock synchronized too.

### Router routes

Configure `.deploy/app-router/xs-app.json`:

```json
{
  "welcomeFile": "/jnj.com.heatmap.dashboard/webapp/index.html",
  "authenticationMethod": "route",
  "routes": [
    {
      "source": "^/heatmap/(.*)$",
      "target": "/heatmap/$1",
      "destination": "srv-api",
      "authenticationType": "xsuaa"
    },
    {
      "source": "^/(.*)$",
      "target": "$1",
      "localDir": "resources",
      "authenticationType": "xsuaa"
    }
  ]
}
```

Preserve required generated settings. Keep the API route first. Do not disable CSRF protection as a general workaround for upload failures; investigate the failed request/token flow.

## 6. Review the MTA modules and bindings

The supplied MTA already defines:

| Module | Path | Required bindings |
|---|---|---|
| `vdxp-fe-app-heatmap-srv` | `gen/srv` | XSUAA and HDI |
| `vdxp-fe-app-heatmap-db-deployer` | `gen/db` | HDI |
| `vdxp-fe-app-heatmap` | `.deploy/app-router` | XSUAA and backend destination |

Backend provides `srv-api` with `srv-url: ${default-url}`. Router requires it in the destinations group with:

```yaml
properties:
  name: srv-api
  url: ~{srv-url}
  forwardAuthToken: true
```

Resources are XSUAA (`application`) and HANA (`hdi-shared`). Retain the supplied authentication redirect configuration and verify it is valid for the final router route.

## 7. Configure application authorization

The original security file contains no business role templates. Login and tile visibility do not provide Viewer/Editor separation automatically.

Before business production:

1. Define roles such as HeatmapViewer and HeatmapEditor.
2. Apply matching CAP authorization rules to entities and actions, including Excel upload.
3. Generate/review the XSUAA scopes and role templates from those annotations.
4. Create BTP role collections and assign the appropriate users.
5. Test permitted and denied operations with separate accounts.

Hiding buttons is a presentation change, not API authorization.

## 8. Initial build and deployment

Install the MTA plugin if missing:

```bash
cf plugins
cf add-plugin-repo CF-Community https://plugins.cloudfoundry.org
cf install-plugin multiapps -r CF-Community
```

Log in using the API endpoint copied from Cockpit:

```bash
cf login -a YOUR_CF_API_ENDPOINT --sso
cf target -o c504766ftrial -s dev
cf target
```

For a different environment, replace the organization and space. Confirm the target before deploying.

```bash
mbt build -t mta_archives --mtar heatmap-release.mtar
ls -l mta_archives/heatmap-release.mtar
cf deploy mta_archives/heatmap-release.mtar
cf apps
cf services
```

Success means `Process finished`, with backend and router running. The database deployer is a task-based module; it need not remain a running web application.

If another operation is ongoing, abort it only after confirming it is the stale/failed deployment you intend to replace. Use its current operation ID:

```bash
cf deploy -i OPERATION_ID -a abort
```

Do not copy an old operation ID from a previous deployment.

## 9. Validate and import data

Open the direct dashboard and list URLs before adding Work Zone tiles. Confirm:

- Login completes.
- Dashboard and list render.
- Excel upload completes and reports its record count.
- RICEFW Type/Priority heatmap displays counts and aligned colors.
- Selecting a cell filters Top Risk Areas.
- Clicking a risk opens the selected object's page.
- List identifier shows RICEFW with WRICEF Name.
- Imported data remains after refresh/restart.

A completed Excel import writes records to the deployed HANA container. Partial imports can save successful rows while reporting errors. The current backend rejects Replace existing records in production. Import with replacement unchecked.

The file picker permits 10 MB, but base64 encoding increases request size and the backend body limit is 10 MB. Therefore files near the picker maximum may exceed the request limit; align limits deliberately if larger uploads are needed.

## 10. Create Work Zone application tiles

1. Subscribe to SAP Build Work Zone, standard edition.
2. Assign administrators `Launchpad_Admin` and open Site Manager.
3. In Site Directory, create `RICEFW Management`.
4. In Site Settings, choose **Spaces and Pages – New Experience** and save.
5. Open Content Manager → Create → App.

Create these URL apps:

| Setting | Dashboard | List |
|---|---|---|
| Title | Heatmap Dashboard | RICEF List |
| Technology | URL | URL |
| System | No System | No System |
| Semantic Object | RiskHeatmap | RiskList |
| Action | display | manage |
| URL | Direct dashboard URL above | Direct list URL above |

Initially choose **Open App: In a new tab**, save, and validate each tile. URL tiles are manually registered links; this deployment does not publish the apps into the HTML5 repository for automatic content-provider discovery.

### Put tiles on the home page

1. Create Page `RICEFW Applications` and add a section containing both apps.
2. Create Space `RICEFW Management` and assign that Page to it.
3. Assign both apps and the Space to the intended content role.
4. Assign the role to the site where required.
5. Save and open the site through Site Directory.

For a trial demo, Everyone can be used. It is implicit for all site users and has no corresponding BTP role collection. For restricted production access, use a dedicated content role and its corresponding BTP role collection.

Groups mode displays groups, not configured Spaces/Pages. Match the site mode to the content you create.

## 11. Optional: allow in-place embedding

The router normally sends `X-Frame-Options: SAMEORIGIN`. Work Zone runs on a different origin, so embedded display can be blocked.

If in-place display is required, add these properties to the **router module**, alongside `parameters`, while retaining its existing requires/provides:

```yaml
properties:
  SEND_XFRAMEOPTIONS: "false"
  httpHeaders: >-
    [{"Content-Security-Policy":"frame-ancestors 'self' https://c504766ftrial.launchpad.cfapps.us10.hana.ondemand.com"}]
```

Replace the Work Zone origin with the exact origin of the intended site, without `/site` or query parameters. Preserve other HTTP headers if already configured; review any existing CSP policies because multiple policies are jointly enforced.

Rebuild/redeploy, sign into the direct app once, then test the in-place tile. Authentication redirects or browser cookie rules may impose separate restrictions. Confirm the blocked URL and response headers in browser developer tools. Do not allow arbitrary frame origins to bypass the error.

For native launchpad integration beyond URL tiles, plan HTML5 Application Repository/managed-router integration separately; it is not included in the current standalone MTA.

## 12. Give access to other users

1. In BTP → Security → Users, add the person under the identity provider they actually use.
2. Assign the Work Zone end-user role collection available for the subscription, commonly `Launchpad_External_User`.
3. For dedicated content roles, assign the corresponding role collection to the user and ensure that role is assigned to the site.
4. Assign the CAP application's Viewer/Editor role collection if implemented.
5. Share the Work Zone site URL and test with the user's own account.

Business users do not need Space Developer or Launchpad_Admin. Everyone controls content visibility; it does not replace backend authorization.

## 13. Inspect uploaded data in HANA

### Open tools versus connect to app data

Opening Explorer from HANA Cloud may request DBADMIN credentials: this is the password chosen when the database was created. It is different from BTP credentials and the application service-key password. If forgotten, use the available administrator reset process or contact the database administrator.

For application data, create an HDI container connection to `vdxp-fe-app-heatmap-db`, or add a separate SAP HANA Database connection using its service key.

1. BTP → dev → Service Instances → `vdxp-fe-app-heatmap-db`.
2. Open Service Keys; create a dedicated inspection key if needed.
3. In Explorer, click + and select HDI Container if available. Select the intended service.
4. Alternatively select SAP HANA Database and enter service-key `host`, `port`, `user`, `password`, enable TLS, and select the key's `schema`.
5. Use `user`/`password` for data access; `hdi_user`/`hdi_password` are deployment credentials.

The observed schema was `3E165E1963CC4A3BA02D79F5DCFC1B99`. Retrieve the current value from the service key; a new environment/container will have another schema.

Run on the container-authorized connection:

```sql
SELECT COUNT(*) AS "RECORD_COUNT"
FROM "3E165E1963CC4A3BA02D79F5DCFC1B99"."JNJ_COM_HEATMAP_RISK";

SELECT TOP 100 "RICEFW", "WRICEFNAME", "RICEFWTYPE", "PRIORITY"
FROM "3E165E1963CC4A3BA02D79F5DCFC1B99"."JNJ_COM_HEATMAP_RISK";
```

If the table browser says DBADMIN above Search Tables, it is filtering the DBADMIN schema. Select the application's schema. DBADMIN may see the table definition but still lack SELECT privileges on HDI-owned data: use the authorized container connection. For routine production inspection, have an administrator provision a dedicated read-only user/role rather than distribute runtime credentials.

## 14. Hide Create/Edit/Delete temporarily

In `srv/annotations.cds`, add inside the Risk UI annotation containing HeaderInfo:

```cds
CreateHidden: true,
UpdateHidden: true,
DeleteHidden: true,
```

This hides list Create/Delete and Risk object-page Edit/Delete. Remove the ImportExcel action's `position` that anchors to StandardAction::Create in the risk-list manifest. Keep the import action itself.

These are the requested Risk controls; related child entities have their own annotations. Backend authorization must still enforce allowed operations.

## 15. Repeatable update/redeployment

1. Synchronize changed source from Windows/Git to BAS.
2. Review changes and the target environment; update dependency lock files only when dependencies changed.
3. Increment the MTA version for tracked releases and retain the previous archive.
4. Build and deploy:

```bash
cf target
mbt build -t mta_archives --mtar heatmap-updated.mtar
cf deploy mta_archives/heatmap-updated.mtar
cf apps
```

5. Hard-refresh the UI and repeat the validation checks.

A normal update retains the existing HDI service and data. Do not delete/recreate the database service. Review schema migrations before deployment; retaining the service does not make destructive schema changes harmless. Reverting application code alone may not reverse a database migration.

## 16. Troubleshooting reference

| Symptom | Check/action |
|---|---|
| `npm ci` EUSAGE, missing package in lock | Run npm install in the affected package, save lock file, retry npm ci. |
| Backend crashes on `less-openui5` | Remove development-only import/middleware from production bootstrap; inspect gen/srv/server.js; build a fresh archive. |
| Existing MTA operation | Confirm current failed operation ID and abort before deploying the corrected archive. |
| No Work Zone tiles | Verify app → page → space → content role → site assignments, user role, and site view mode. |
| In-place refused to connect | Check X-Frame-Options/CSP on the blocked response; allow exact Work Zone origin or use new-tab launch. |
| Blank standalone page | Inspect Network for Component.js, manifest.json, fragments, SAPUI5 libraries, and /heatmap/$metadata. Verify response content, not just status. |
| `favicon.ico` 404 | Missing browser icon; does not explain a blank application. |
| `unload` permissions warning | Does not by itself identify the startup failure; inspect component/API requests and actual errors. |
| No tables under DBADMIN | Select the app HDI schema or add its container connection. |
| HANA error 258 / insufficient privilege | Current user lacks object access; use the authorized container connection. |
| Authentication failed | Confirm selected database/user/password; distinguish DBADMIN and service-key credentials. |
| Upload HTTP 413 | Check base64-expanded payload against backend and proxy request limits. |
| Upload HTTP 403 | Check application roles, production replacement flag, and CSRF/login flow. |

Useful commands:

```bash
cf logs vdxp-fe-app-heatmap-srv --recent
cf logs vdxp-fe-app-heatmap --recent
cf logs vdxp-fe-app-heatmap-db-deployer --recent
cf tasks vdxp-fe-app-heatmap-db-deployer
cf dmol -i CURRENT_OPERATION_ID
```

Before a business release, verify role enforcement with separate accounts, database backup/restore readiness, monitoring and support ownership, upload limits, supported SAPUI5/Node versions, and direct/Work Zone navigation. The observed dashboard runtime bootstrap and UI build configurations use different SAPUI5 versions; align and validate them as part of release preparation.

## 17. Official references

- [CAP deployment to Cloud Foundry](https://cap.cloud.sap/docs/guides/deploy/to-cf)
- [CAP authorization](https://cap.cloud.sap/docs/guides/security/authorization)
- [SAP application router settings](https://www.npmjs.com/package/@sap/approuter)
- [Create Work Zone URL apps](https://developers.sap.com/tutorials/cp-portal-cloud-foundry-url-applaunchpad/)
- [Work Zone Spaces and Pages](https://developers.sap.com/tutorials/cp-portal-cloud-foundry-spaces-pages)
- [Assign content to a Work Zone role](https://help.sap.com/docs/build-work-zone-standard-edition/sap-build-work-zone-standard-edition/federation-assign-content-to-role)
- [HANA Database Explorer connections](https://developers.sap.com/tutorials/hana-dbx-connections)

This guide records the project-specific configuration and troubleshooting from the session. It is not a certification that all business-production checks have been completed.
