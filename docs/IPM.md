# Install Access Atlas with IPM

The package contains the production frontend, the gateway with its npm dependencies, and the native telemetry/log extension. Node.js 22.12 or newer is still required to run the gateway. You do not need npm, Git or a compiler on the target host when installing a packaged release.

## Requirements

- IRIS 2026.2 or newer with the SysAdmin v2 API, Embedded Python and IPM installed. The validated environment is IRIS Community 2026.2 build 221U on Linux.
- An administrator able to install ObjectScript classes and register `/api/atlas`.
- Node.js 22.12+ on the gateway host, an existing writable campaign directory outside the installed package, and a stable instance identifier.
- `/api/admin` enabled with password authentication. Use existing IRIS credentials; the package does not create accounts, passwords, roles, grants or sample data.

## Install the package

In the IRIS terminal, use `%SYS` for the extension when connecting to an existing installation:

```objectscript
zn "%SYS"
zpm "install access-atlas"
```

The registry command requires publication in the community registry. Until the Open Exchange publication has completed, download `access-atlas-1.3.0.tgz` from the [1.3.0 release](https://github.com/Igorandor/access-atlas/releases/tag/v1.3.0), transfer it to the IRIS host, and load that archive instead:

```objectscript
zn "%SYS"
zpm "load /path/to/access-atlas-1.3.0.tgz"
```

IPM clients without archive loading can extract the archive and load its directory containing `module.xml`. Developers can also use `zpm "load /path/to/access-atlas"` on a source checkout with its committed payload.

IPM prints the deployed file path during activation. With the standard Linux layout, the gateway is in `/usr/irissys/lib/access-atlas/1.3.0/`. It registers `/api/atlas` in the installation namespace with password authentication and `%Admin_Operate` protection. An existing route with another dispatch class or namespace is refused. Use the same namespace for upgrades; do not install this instance-wide route twice.

## Configure and start

Create a campaign directory owned by the unprivileged OS account that will run Node. Keep it outside both the IPM module cache and the installed `lib/access-atlas` tree. The launcher resolves symbolic links and refuses a data directory inside its package tree. Back this directory up according to your retention requirements.

Create a separate environment file, for example `/etc/access-atlas/atlas.env`. This loopback-only example assumes Node runs on the same host as IRIS and its web port is 52773:

```dotenv
IRIS_URL=http://127.0.0.1:52773
IRIS_INSTANCE_ID=atlas-production
ATLAS_DATA_DIR=/var/lib/access-atlas/campaigns
PUBLIC_ORIGIN=http://localhost:3200
COOKIE_SECURE=false
HOST=127.0.0.1
PORT=3200
```

Do not put an IRIS password in this file. Operators sign in with their own credentials. For remote access, configure HTTPS at your reverse proxy, use its exact HTTPS origin in `PUBLIC_ORIGIN`, and set `COOKIE_SECURE=true`. Keep the Node listener private. See [deployment](DEPLOYMENT.md) for the existing-instance configuration and security requirements.

Start the installed gateway as the unprivileged account:

```sh
node --env-file=/etc/access-atlas/atlas.env /usr/irissys/lib/access-atlas/1.3.0/start.mjs
```

Open the configured origin, sign in and check the instance identifier and completeness of the access capture. Create a campaign, save a capture, then restart the gateway and reopen the campaign. `/api/health` checks the gateway process; it does not prove native permissions or complete data capture. Follow the [first review](FIRST_REVIEW.md) for the operator workflow.

The foreground command stops with Ctrl+C. For continuous operation, run that same command under your normal service manager with an unprivileged account, the external environment file, automatic restart on failure and access to the campaign directory. IPM does not create a system service or open firewall ports.

## Upgrade or uninstall

1. Stop the gateway and back up the campaign directory. Do not reset IRIS or remove existing data volumes.
2. Install the new package version in the original namespace. Each release has a versioned gateway directory.
3. Update the service command to the installed version. Preserve `IRIS_INSTANCE_ID`, `ATLAS_DATA_DIR` and the operator's native identity; these determine campaign scope.
4. Restart, sign in again and reopen an existing campaign. In-memory sessions and pending proposals do not survive a gateway restart.

To remove the package, stop its gateway first, then run `zpm "uninstall access-atlas"` in its installation namespace. IPM removes its registered extension and installed gateway files. It does not delete the external campaign directory or your separate environment file. Keep their backup if reinstalling later. Do not run uninstall against a hand-installed extension you still need; migrate ownership deliberately.

## Build a distributable

For maintainers, run `npm ci`, `npm run build:ipm`, `npm test` and `npm run test:ipm`. Commit the generated `ipm/gateway` directory with source changes. It includes third-party licenses and a SHA-256 file inventory; the CI rebuild detects stale payloads. Do not include credentials, campaign files or `node_modules`.

Load the source through IPM on a disposable IRIS instance, then run:

```objectscript
zpm "package access-atlas -path /tmp/atlas-package/"
```

Test the resulting archive on a clean installation before release. Submit package publication through the existing Open Exchange application. Registry availability and contest bonus decisions are separate from a successful local package build.

## Validation of 1.3.0

On a separate IRIS Community 2026.2 build 221U container with IPM 0.10.8, source loading in `%SYS`, archive loading in `USER`, native login, access capture, telemetry/log reads and campaign persistence were exercised. Uninstall removed the extension and gateway while leaving the external campaign file byte-for-byte unchanged; archive installation and gateway restart reopened its saved capture. A conflicting route was refused before activation. The installed frontend was checked at desktop and 390px widths. The source suite has 302 passing tests, plus two packaging tests for payload integrity, isolated startup, session/origin checks and rejected data paths.
