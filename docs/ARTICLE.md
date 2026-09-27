# Reviewing inherited IRIS permissions with Access Atlas

Removing a role from an IRIS account may leave its permissions unchanged if another assigned role grants the same access. Access Atlas shows these inheritance paths and lets you preview a removal before changing the account.

For a recurring review, a campaign saves configuration captures, decisions and follow-up work. The examples below start with one account, then show how to keep that review for the next quarter.

The [repository](https://github.com/Igorandor/access-atlas) contains the application, installation instructions and verification records. Original application code is MIT licensed; IRIS has its own license.

## A review scenario

Consider an operator reviewing a service account before the next quarterly access review. The account has several assigned roles, some of which inherit other roles. A resource grant may come from more than one path. Removing one assigned role therefore does not necessarily remove the grant.

In Access map, select the account and expand a resource row. Atlas displays the source-role paths behind the captured grants. Uncheck an assigned role to preview its removal locally, then use Reset preview to restore the original projection. This changes the analysis only; it does not edit the account.

Resource matrix offers another starting point: choose a resource and inspect the accounts with configured grants. Public privileges and the special `%All` indicator appear separately. Explain access answers a specific account/resource or application-entry question and distinguishes ordinary, conditional and public grants.

These views explain configuration. They do not prove that a particular request will succeed or fail at runtime. Missing sources remain warnings or unknown evidence, and conditional escalation is not treated as an ordinary grant.

## Try the read-only workflow

The bundled installation needs Docker with Compose v2, Linux containers, at least 4 GB of available RAM and approximately 5 GB of free disk space. From a fresh checkout, run:

```sh
git clone https://github.com/Igorandor/access-atlas.git
cd access-atlas
docker compose up -d --build
```

Open `http://localhost:3200` and sign in with the bundled quick-start account:

- Username: `SuperUser`
- Password: `AtlasLocal-2026!`

Both published ports bind to loopback. This published credential belongs to the bundled image; an installation for other users needs private credentials and HTTPS. The [README](https://github.com/Igorandor/access-atlas/blob/main/README.md) also explains connecting to an existing instance without replacing its account passwords.

For a first inspection:

1. Open Access review and read the capture completeness indicator before interpreting results.
2. Select an account in Access map and inspect a resource's source-role paths.
3. Preview removing an assigned role, compare the projected grants, then reset the preview.
4. Inspect the corresponding resource in Resource matrix or ask a focused question in Explain access.
5. In Changes, choose Use current as baseline. Capture again later to compare configuration, without making any administrative changes during this walkthrough.

Ad hoc captures remain in browser memory and clear on logout or reload. Saved campaigns provide the retained workflow.

## Turn inspection into a recurring review

Create a named campaign, configure its certification scope, then save a labelled capture. Duty rules can highlight combinations of roles that need review. Policies produce deterministic findings; neither mechanism enforces permissions.

Record an acceptance, required change, investigation or exception with a reason. Object certification adds a separate decision about selected accounts, roles, resources or applications. It checks captured object and dependency evidence before carrying a decision forward, preserving the original human review date rather than inventing a new approval.

Report & follow-ups brings together readiness checks, due work, decisions and remediation receipts. A campaign cannot close with incomplete evidence, unresolved certification, investigations still in progress or submitted changes awaiting readback. Archiving can preserve unfinished work without presenting it as complete.

Next review period copies selected rule, policy and scope definitions into a new campaign. It does not copy old captures, decisions or receipts. The [campaign walkthrough](https://github.com/Igorandor/access-atlas/blob/main/docs/CAMPAIGNS.md) explains these boundaries. Printable HTML reports contain escaped values, no scripts and no external assets; JSON, Markdown and CSV exports support further review.

## What happens when a change is necessary?

Supported findings can produce targeted remediation proposals, such as removing a directly assigned role or requiring application authentication. Review reads the current target and checks the selected fields. Apply requires the exact target confirmation, records dispatch and attempts a readback.

If the response is lost, Atlas exposes uncertainty. Reconcile reads the target without replaying the write. A recorded difference remains a difference; it is not labelled successful verification. These controls reduce accidental repetition and stale updates, but cannot lock out another administrator using native tools.

## Implementation and verification

The React and TypeScript client talks to an Express gateway using an HttpOnly session cookie and CSRF protection. The gateway holds the operator's credentials in memory and sends allowlisted requests to one configured IRIS endpoint. Native SysAdmin v2 APIs remain responsible for authorization.

A protected ObjectScript and Embedded Python extension supplies bounded log reads and host observations without invoking a shell. Linux counters describe the OS visible to IRIS, which may differ from container quotas. Campaign storage validates ownership and revisions; deployment requires one gateway writer per campaign directory.

The September 27, 2026 checkpoint passed production builds and 218 Node tests. Separate native checks used IRIS Community 2026.2; IRIS for Health and complete external identity-provider flows remain unverified. Development used AI assistance, with implementation history and retained references documented in [provenance](https://github.com/Igorandor/access-atlas/blob/main/docs/PROVENANCE.md).
