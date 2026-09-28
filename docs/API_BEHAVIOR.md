# Reading API results in Access Atlas

These five distinctions help when reviewing access or applying a change. They describe Atlas's implementation and its recorded checks against IRIS 2026.2; they are not a list of defects in IRIS.

## 1. A resource grant is not a complete answer about runtime access

The access map traces captured account roles, inherited roles, resource permissions and web-application entry settings. It does not impersonate an account or evaluate SQL privileges, row policies, application code or an existing session. A missing definition or failed read means **unknown**, not “access denied.” Check capture warnings before recording a decision.

See [analysis semantics](ACCESS_ANALYSIS.md), the [collector](../server/access-snapshot.ts) and [capture validation tests](../tests/capture-validation.test.ts). The platform documents [resource-based authorization](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=AAUTHZ) and [SQL privilege checks](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=RSQL_checkpriv) separately.

## 2. A reviewed proposal can become outdated

Before submitting a change, Atlas reads the target again. An edit is refused if a field being changed no longer matches the review; deletion checks the full captured object. Prepare a new proposal after inspecting the current configuration. Another administrator's unrelated edit is preserved when only your changed fields are submitted.

This is not an atomic lock on IRIS. A change outside Atlas can still occur between the final read and write. See [review execution](../server/reviewed-changes.ts) and the [drift and duplicate-dispatch tests](../tests/reviewed-changes.test.ts).

## 3. Accepted, verified and uncertain are different outcomes

Read the result, not just the HTTP status:

| Result | What to do |
| --- | --- |
| Verified | Inspect the checked fields; the subsequent read matched those values. This does not verify unrelated settings. |
| Acknowledged | The request was accepted, but completion or the value cannot be established by this read-back. Password changes, task launches and background work can have this outcome. |
| Different / unverified | Inspect the mismatch or restore permission to read the target before deciding what to do next. |
| Uncertain | Retrieve the receipt and inspect native state before preparing another write. A lost response does not establish that nothing happened. |

Atlas does not automatically replay an uncertain write. A failed response in the browser preserves the draft and offers a read-only recovery path. See [receipt status tests](../tests/reviewed-changes.test.ts) and [apply-response recovery](APPLY_RESPONSE_RECOVERY.md).

## 4. An audit search may first return a background job

The audit-record query uses POST even though its purpose is reading records. Atlas takes the job identifier from a `202` response's `Location` header, then reads `/v2/async-result`. If the job is still running after the bounded polling period, the message retains its ID. Inspect that job before repeating the query; an empty initial result is not proof that there are no audit events.

A missing or unusable job identifier is reported as a protocol failure. See the [transport](../server/atlas-transport.ts), [polling client](../src/api.ts) and [protocol regression tests](../tests/protocol-errors.test.ts).

## 5. Suspending a schedule does not prove a running task has stopped

Task configuration and execution information are read separately. Atlas verifies suspend/resume by reading `Suspended` from `/v2/task/info`. An accepted **Run** request is acknowledged rather than reported as a completed job; inspect execution information and task history for its outcome.

The [native workflow check](../scripts/live-workflows.ts) creates a disposable task and checks its suspension/resumption separately from submitting an on-demand run. See the [recorded verification scope](VERIFICATION.md) and [task detail implementation](../src/desk/ConfigurationDesk.tsx).
