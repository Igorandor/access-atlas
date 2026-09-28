# Atlas architecture

The browser has three workspaces. Review owns the access graph, matrix, review notes and baseline comparison. Administration is a configuration register: inspect a record, explicitly include fields in a proposal, compare the selected values and apply it. Instance gathers labelled observations from the native API and extension.

The proposal desk is Atlas-specific. `TypedProposal` provides schema-backed scalar, enum, object and array controls; unselected root fields are omitted. Selecting an existing field starts with its inspected value where it is safe to reuse. Credential values are write-only and masked for review. Tasks receive complete defaults on creation; updates send only selected fields. Before an update, Atlas rereads those fields and refuses a conflict. This is not an atomic native compare-and-swap.

`atlas-sessions.ts` owns expiring sessions, login budgets and capture coordination. `app.ts` supplies same-origin/CSRF enforcement and separate session, evidence-capture and native-operation routes. `atlas-transport.ts` validates exact operations against the pinned contract and explicit write policy, applies concurrency and response budgets, translates known wire differences and projects safe diagnostics. `upstream.ts` exposes a compatibility import used by the collector and regression probes.

Requests target one configured IRIS endpoint. The gateway never accepts arbitrary URLs, follows redirects or automatically retries writes. Credentials stay in server memory. Native permissions remain authoritative. The `Atlas` extension observes the OS visible to IRIS and reads bounded windows of two allowlisted logs; it does not launch a shell.

The access collector and strict snapshot schema are unchanged in purpose. See [analysis semantics](ACCESS_ANALYSIS.md) for partial capture, special roles, escalation and imported evidence.

## Native adaptations

- Audit records use POST and bounded async-result polling.
- OAuth client `OAuth2ServerDefinition` is translated to the tested native `ServerDefinition` field.
- Task execution state is read separately from `/v2/task/info`; the task-list suspended flag is not treated as authoritative.
- Creation supplies the native task fields omitted from JSON Schema required declarations.
- Empty/HTML 401 and 403 responses retain their status; failed native error envelopes cannot become successful writes.

See [source references](PROVENANCE.md) for API references and validation support.

## Retained reviews and write lifecycle

`campaign-store.ts` stores bounded JSON documents under a hash of native reviewer and configured instance. Reads validate schema and ownership. Listings project one document at a time to summaries; the gateway does not hold every campaign's snapshots in an aggregate list. Writes serialize revision checks with atomic replacement. Next-period creation loads its source under the same store lock, checks its revision and copies only selected definitions into a fresh campaign.

`campaign-routes.ts` probes current identity and native security read access on every request. Captures, policy definitions, finding decisions, object certification, lifecycle changes and remediation records have explicit validated actions. Certification carry-forward compares relevant dependency evidence and preserves the original human review timestamp.

`reviewed-changes.ts` keeps short-lived, session-bound proposal tickets. Preparation reads the target; execution checks identity, selected fields and process generation again, acquires a canonical target lock and dispatches once. Readback produces verified, different, acknowledged, unverified, uncertain or failed results. Credential-bearing values remain only in the pending in-memory operation; consumed tickets discard request bodies. Session receipt listings recheck each source's native read privilege through `receipt-authorization.ts`. Generic native writes cannot bypass this lifecycle.

Campaign remediations persist the dispatch marker before the write. Reconciliation reads expected fields without replay. An active remediation blocks conflicting campaign edits; interrupted dispatch remains visible after restart. Campaign files are reviewer-owned working records, not an immutable security log.

## Analysis and exports

Inquiries explain a fixed account/target/permission question, optionally evaluating up to 50 reusable questions. Role candidates describe collateral captured grants. Drift analysis separates object changes, grant movement and finding predicates while preserving unknowns in incomplete captures. Campaign reports derive readiness, follow-ups and a decision register from stored data; HTML exports escape every value and contain no scripts or external resources. None of these analyses performs a native write.
