# What the access analysis means

Access Atlas reviews **declared configuration**. It does not impersonate another user, call an authorization decision for their running process, or certify that an instance is secure.

## Evidence model

The collector reads native users, role definitions, resource metadata and web-application configuration with the current operator's privileges. It retains only the fields needed for access review. It does not include passwords, wallet values, private keys, email addresses or phone numbers.

For each account, the graph starts at its configured `Roles` and follows each role's `GrantedRoles`. A breadth-first traversal records one shortest source path per role, unions its explicit `Resources` grants, detects cycles and reports missing definitions. This is a bounded graph traversal, not recursive rendering or an unbounded server query.

The displayed permission letters are R (read), W (write) and U (use). Public permissions are shown in a separate matrix row. `%All` is marked as a broad role rather than expanded into invented per-resource grants. In particular, `%Secure_Break` and row-level policies have special behavior. See the official [role documentation](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=GSA_config_roles) and [privilege documentation](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=GSA_config_privs).

`EscalationRoles` are displayed separately and are not silently added to login roles. Paths through `EscalationOnly` definitions are labeled conditional. Application/matching roles, service authentication, SQL grants, row policies, active sessions and privileged-routine escalation are outside this projection. A disabled account retains its configured grants but cannot be assumed to have an active login. Review [IRIS role escalation](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=ASECURITYAPI) when interpreting runtime behavior.

## Removal preview

Unchecking an assigned role recomputes the graph with that root omitted. The preview shows how many explicit resource grant sets differ and whether the declared path to `%All` disappears. Alternative paths preserve their grants. Public privileges and runtime escalation remain separate. No API write occurs, and the preview is not an automatic remediation plan.

## Review queue

Three deterministic prompts are included:

- An enabled account reaches `%All` through its declared roles.
- A resource has public W permission.
- An enabled web application includes the unauthenticated authentication bit.

These configurations can be legitimate. The queue deliberately has no invented security score or automatic severity claim. A reviewer records a reason or follow-up. Notes are tied to the finding's exact content; if that content changes, the finding needs a new review. Evidence exports include capture time, warnings and the relevant notes. The file is editable JSON, not a signed compliance attestation.

## Snapshot comparison

The Changes view compares selected configuration fields, ignoring object ordering and unordered role/grant list ordering. It reports added, removed and changed records, with before/after JSON. It refuses comparisons between different configured instances or incomplete captures, so a denied list cannot masquerade as deleted accounts.

The baseline may be captured in memory or imported from an exported snapshot. Imports are capped at 2 MB and validated against a strict schema with collection bounds and unique identities. Imported data is never executed or submitted to IRIS. Snapshot files contain security metadata and should be handled according to your organization's policy.

Instance matching uses the administrator-configured `IRIS_INSTANCE_ID` (or the upstream origin when omitted). Set a unique, stable value for each deployment; Compose exposes it as `ATLAS_INSTANCE_ID`. This is a configuration guard, not cryptographic server identity. Do not reuse the same label for different instances or compare files after repointing it to another server.

## Capture bounds and consistency

- Up to 200 users, 200 roles, 200 applications and 999 resources.
- One extra list row is requested to detect truncation.
- Six concurrent detail reads, each with the gateway's 20-second timeout.
- New detail reads stop after a 45-second collection budget; in-flight requests can finish later.
- Requests within one session share an in-flight capture. Captures are not shared between users and are rate-limited to one start per five seconds after completion.
- Every failed or skipped read is reported. Missing privileges are unknown, never assumed denied.

The start and end timestamps describe a **non-transactional** interval: another administrator can change configuration during collection. Refresh before making a decision. Snapshots and notes are held only in browser memory; navigating between administration and review keeps them, while reload or logout clears them. Export evidence before ending your session.
