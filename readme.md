# Heatmap Application

This repository contains the CAP service and two SAPUI5 applications: the Risk Heatmap Dashboard and the Risk List.

## Prerequisites

- Node.js and npm
- The SAP Cloud Application Programming Model development tools, including the `cds` command
- Internet access for the initial SAPUI5 framework setup

## Run Locally

1. Clone the repository from Git and open a terminal in the repository root (the folder containing this README).
2. Install the project dependencies:

	```sh
	npm install
	```

3. Set up the SAPUI5 framework packages used by the local launchpad:

	```sh
	npm run setup:ui5
	```

	This setup is needed the first time, or after clearing the local UI5 framework cache.

4. Start the CAP server:

	```sh
	cds watch
	```

	In VS Code, you can also run the **cds watch** task from **Terminal > Run Task**.

5. Open the application at <http://localhost:4004>.

The launchpad has tiles for both applications:

- Risk Heatmap Dashboard
- Risk List

The OData service is available at <http://localhost:4004/heatmap/>. Keep the terminal running while using the application; press `Ctrl+C` to stop the server.

## Local Development Notes

- The root `app/` folder contains the launchpad and the two UI5 applications.
- The CAP service and data model are in `srv/` and `db/`.
- Local development uses the project's development configuration. Production database and authentication settings are separate.
