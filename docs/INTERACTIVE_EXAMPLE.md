# Explore a grant without installing IRIS

[Open the interactive example](https://igorandor.github.io/access-atlas/).

The interactive example uses the same Access map and Resource matrix components as Access Atlas, with a small synthetic configuration. It runs entirely in the browser. It asks for no credentials, contacts no IRIS instance and saves no review records.

## Follow two paths to one resource

The page includes a **Three-step walkthrough** you can expand while exploring.

1. Open **Access map** and select **alex.training**.
2. Expand **TrainingOrders**. Inspect the path through **SupportTeam** and the independent path through **ReportingReader**.
3. Uncheck **SupportTeam**. The preview removes write permission, while read permission remains through ReportingReader.
4. Choose **Reset preview** to restore the original role selection.
5. Open **Resource matrix**. It shows the original example capture, unaffected by the Access map preview. Inspect an account/resource cell for its explanation, and the separate public-permissions row for **TrainingStatus**.

The graph explains declared configuration. It does not test an IRIS session's runtime access, change a role assignment or model application-specific authorization.

## Use your own instance

Follow the [installation instructions](../README.md#quick-start-complete-local-installation), then the [first access review](FIRST_REVIEW.md). The installed portal reads IRIS and stores campaigns on its gateway. The interactive example has neither of those services.

## Build the example

From this repository, install dependencies with `npm ci` and run `npm run build:example`. The separate build writes only static files to `dist-example`. The regular application build and Docker image do not load the example snapshot or use it as a fallback for failed API calls.

The Pages workflow checks the project and publishes only `dist-example`, from `main`. Its content security policy blocks API connections from the example; fonts and application assets are hosted with the page. Opening a documentation link navigates to that external page normally. No analytics are included.
