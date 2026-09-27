# Recurring access reviews

Campaigns store review work independently of the ad hoc access snapshot. A campaign belongs to the signed-in native account and configured instance. Reopening it requires current native access to security users and roles.

The Campaigns tab remains available while an ad hoc capture is loading or after its first request fails. Other configuration views require a returned snapshot. For example, reloading the browser during the five-second capture cooldown can reject the initial capture with 429; you can still open saved campaigns without waiting for another capture. A campaign's own read failure or permission refusal is shown separately and does not bypass its current native access checks. Use Capture again when you need fresh ad hoc configuration evidence. A partial snapshot with source warnings continues to support the existing configuration views.

## Start and capture

1. Open Access review → Campaigns and create a named review with its scope and period.
2. Save a labelled capture. Check missing sources and unreadable objects before drawing conclusions.
3. Configure duty rules and review policies. Policies provide deterministic prompts; they do not enforce IRIS authorization.
4. In Decisions, record acceptance, a required change, an investigation or a documented exception with a reason. Follow-up dates are calendar dates in UTC.

Finding decisions are tied to exact finding content. A changed finding requires another review. Captures are sequential reads, not transactions. An unchanged finding can retain its decision even when the capture changed; object certification uses stricter evidence comparison.

In Access map, **Inspect account** opens a fresh read of that account in the configuration register. **Back to access review** returns to the same campaign, map and filter. This also works for the ad hoc access map. The shortcut does not create a proposal or change permissions; the register uses current native authorization rather than the saved capture.

## Object certification

Enable certification in its scope panel. Choose accounts, roles, resources and applications, a name prefix and whether disabled objects are included. The scope may have a review due date. Select an object, inspect the captured facts and dependencies, and record retain, change, remove, investigate or exception with a reason.

Selecting the already open object keeps its unfinished decision. A rejected save also leaves the draft in the form. If another session changed the campaign, reload it, check the current evidence and explicitly save again. Save before selecting a different object or leaving Certification; unfinished drafts are not stored persistently in the browser.

Only retained or excepted objects with known evidence satisfy certification. Changed or removed objects cannot silently inherit a prior decision. After another capture, Carry forward compares object and dependency evidence; it transfers only equal, complete evidence. The original human review date is preserved and the carry action is recorded in campaign activity. Carry-forward is not a second human approval.

Follow-up dates schedule work. They do not automatically expire exceptions, remove privileges or close a campaign. Overdue follow-ups appear in Report & follow-ups. A campaign cannot close while certification has pending or unresolved subjects, the capture is incomplete, findings lack current decisions or changes remain required.

## Remediation

For supported findings, the Remediation panel creates a fixed targeted proposal: remove a directly assigned role, disable an account, remove public write, require application authentication or disable an application. It presents the captured baseline and, where available, an access projection.

Review reads the current target and rejects stale selected fields. Apply requires its exact target. The campaign records dispatch before a native write. A successful response is followed by a readback; unavailable or differing results remain explicit. Reconcile reads the target without replaying the operation. An interrupted dispatch must be reconciled before editing the campaign or attempting another remediation.

Acceptance or exception decisions are review records, not native mutations. Access simulations and role candidates never assign roles automatically.

## Compare and report

Capture history shows counts across saved captures and compares two selected captures. Account impact distinguishes direct assignment changes from inherited-role and public-grant effects. Partial data is marked unknown rather than treated as deletion. A finding no longer matching a predicate is not proof that a particular remediation caused it.

Report & follow-ups contains readiness checks, a follow-up agenda, a searchable decision register, remediation receipts and campaign activity. Export sections can be selected. Identity, readiness, agenda and scope limits always accompany the report. The optional reviewer note belongs only to downloaded reports; it is not saved as a decision.

Printable HTML uses escaped values, no scripts and no external assets. Open it in a browser and print to PDF when needed. JSON, Markdown and CSV provide editable records, not signed compliance attestations. CSV cells that could be formulas are neutralized. Treat exports as security configuration data.

## Next period and retention

Next review period previews copied duty rules, policies and certification scope. It starts a separate campaign with no captures, decisions or remediation receipts; the previous due date is cleared unless a new one is supplied. The source campaign remains unchanged, including any unresolved writes. New period creation requires the selected source revision and current access to it.

Archive hides a campaign from the default list without deleting its data. Include archived restores it to the list. Reopen a closed or archived campaign before changing review records. Campaign limits and backup instructions are in [Deployment](DEPLOYMENT.md).
