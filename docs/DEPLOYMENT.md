# Deployment and security

## Trust boundaries

The portal is an administrative client. It forwards the signed-in operator's identity to a **fixed, administrator-configured IRIS server**. It cannot elevate that operator beyond IRIS permissions. Do not make a shared privileged account available to ordinary users.

- Passwords are kept in process memory for the session, never put into browser storage or logs by the gateway.
- Sessions use 256-bit random opaque identifiers in HttpOnly, SameSite=Strict cookies; 30-minute idle and 8-hour absolute expiry.
- Browser writes require a CSRF token and the configured `PUBLIC_ORIGIN`.
- Requests are limited to paths and parameters in the pinned API contract. Only an explicit list of administrative writes is allowed.
- Secret retrieval endpoints are blocked. Credential-bearing response fields are masked recursively. The wallet only exposes names and types.
- Request bodies are limited to 256 KB; list reads default to 250 rows and cap `maxRows` at 1,000. Upstream requests time out after 20 seconds; writes are never automatically retried.
- In-memory login throttling limits all sign-in attempts (successful and failed) to ten per minute per address. A restart clears sessions and throttling state.
- Portal activity is a bounded, session-local convenience history, not an immutable or durable security audit. Use the native IRIS audit subsystem for authoritative retention.
- Operational log text can contain application data. Pattern masking is best effort; do not assume arbitrary log messages are anonymized.

## Existing installations

Use HTTPS between the browser and gateway and between the gateway and a remote IRIS instance. Set `COOKIE_SECURE=true` and an exact HTTPS `PUBLIC_ORIGIN`. TLS certificate verification remains enabled; there is no insecure-TLS switch.

Bind the server on a private interface or place it behind a trusted reverse proxy. Do not expose the included development credentials or IRIS development container. The example does not configure proxy trust; if your deployment terminates HTTPS at a proxy, pass `COOKIE_SECURE=true` explicitly and configure the public origin.

Credentials remain in memory because HTTP Basic authentication is used against IRIS. This is an explicit design tradeoff: restarting the gateway signs everyone out; horizontal replicas require sticky sessions. A production multi-instance deployment should introduce a shared, encrypted short-lived token/session store and support the organization's identity policy. There is no claim that the example is a hardened multi-tenant service.

## Extension

`Atlas.Rest` requires `%Admin_Operate:USE`, `%DB_IRISSYS:R` for its bundled `%SYS` namespace, and password authentication. These permissions are assigned by an administrator, not by the installer. It does not grant application roles. Embedded Python reads `/proc` on Linux and disk usage for the IRIS manager directory. In a container, host CPU and memory numbers may describe the container host, not cgroup quotas; the UI labels this scope.

Log reads use a fixed allowlist (`messages.log`, `alerts.log`), a maximum 1 MB tail and a maximum 500 lines. No caller-supplied filesystem paths, shell commands or arbitrary SQL are accepted. Missing log files return an explicit empty-source notice. Non-Linux environments retain native API functionality and disk telemetry; Linux-specific metrics are described as unavailable.

## Operations

Back up the IRIS data volume with an IRIS-supported backup procedure. Replacing the portal container does not change IRIS records. Replacing the IRIS image may require a supported IRIS upgrade path; pin and test upgrades. `docker compose down` keeps the volume. Removing the volume destroys the instance's data.

## Gateway-only deployment and retained reviews

`compose.gateway.yaml` starts Atlas against an existing IRIS server. Supply `IRIS_URL`, `IRIS_INSTANCE_ID` and an exact HTTPS `PUBLIC_ORIGIN`; it fixes `COOKIE_SECURE=true` and binds the published gateway port to `127.0.0.1`. Put a TLS reverse proxy on that same host and configure its routing and authentication policy. A remote IRIS connection should use HTTPS. Startup validates URL shape, origin, cookie mode and port values; the gateway does not disable certificate verification.

`IRIS_URL` must be a root origin: scheme, hostname and optional port, with at most a trailing slash. For example, use `https://iris.example:52773`, not `https://iris.example:52773/api/admin` or a reverse-proxy path prefix. Atlas constructs the fixed `/api/admin` and `/api/atlas` paths; a prefixed value used to be accepted even though URL construction discarded its prefix. Startup now rejects that mismatch before opening a listener. An HTTP `PUBLIC_ORIGIN` with `COOKIE_SECURE=true` is also rejected; use HTTPS for secure-cookie deployment, or HTTP with `COOKIE_SECURE=false` for the documented loopback development setup.

Campaign files live at `ATLAS_DATA_DIR` (default `./data/campaigns`), on the `campaigns` volume in the gateway-only Compose file. Run one gateway writer for a data directory. Updates are serialized, revision checked and atomically replaced. Bounds are 100 campaigns per owner/instance, 12 captures per campaign, 1.5 MB per capture, 20 MB per document, 500 finding decisions, 2,000 certification decisions, 200 remediation records and 1,000 history entries. At a limit, export the campaign and begin a new period; records are not silently discarded. Back up this directory separately from IRIS using an access-controlled backup while the gateway is stopped. Do not change `IRIS_INSTANCE_ID` casually: it is part of the storage partition.

Every campaign request rechecks native identity and current users/roles read permissions. Session change receipts recheck the native permission family for each retained source: Secure, Wallet, Manage, Operate/Task or OAuth Client as applicable. The OAuth resource-server family uses Secure, separately from OAuth client configuration. A failed permission probe refuses the list instead of exposing cached metadata. Already viewed or exported data cannot be revoked from the browser or a downloaded file.

Reviewed native writes are single-use, session-bound proposals, with fresh same-field checks and target locks. Raw generic writes are refused. A timeout after dispatch creates uncertainty; there is no automatic replay. These gateway locks do not prevent another native administrator from changing the same object directly. Native IRIS auditing remains the authoritative administrative audit.

`GET /api/health` reports gateway process availability, not successful IRIS authentication. The UI's refresh timestamps and individual API errors describe upstream availability. Use an authenticated external health probe if you need end-to-end monitoring.

## Diagnostic and history bounds

Known authentication echoes are masked in normal and asynchronous diagnostics. Masking is a single literal pass; canonical identifiers remain unchanged. Credential-bearing submissions allow at most 128 values and 32,768 combined characters. Requests exceeding those limits are rejected before forwarding. Session history keeps a console preview of at most 100 lines plus a truncation notice and 16 KiB of serialized UTF-8 console data per entry; the directly requested native response retains its separate response limit. See [the focused security review](SECURITY_REVIEW.md).
