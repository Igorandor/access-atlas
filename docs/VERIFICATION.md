# Verification record

## Standalone report scope — September 27, 2026

HTML and Markdown reports now preserve certification boundaries that were previously present only in the report model and JSON: selected object kinds, name prefix, disabled accounts/applications, required status and review due date. Three regressions cover distinct scopes and escaping; `npm run check` passes production builds and **159 tests**. See [the confirmed omission, correction and validation scope](REPORT_SCOPE_EXPORT.md). Certification and date semantics are unchanged.

## Saved evidence recovery — September 27, 2026

Campaign and receipt GET refusals now invalidate the specific protected view and exports, while temporary failures preserve the selected data and campaign draft. Boolean security flags remain visible without exposing credential values. The combined `npm run check` passes frontend/server production builds and **156 tests**. See [saved evidence recovery and isolated UI scenarios](SAVED_EVIDENCE_RECOVERY.md). No native changes were needed; browser verification is recorded by the integration checkpoint.

## Current expansion checkpoint — September 27, 2026

The new campaign, certification, remediation, inquiry, drift/report and next-period workflows supersede the historical 95-test release described below. Current `npm run check` passes the production build and **149 tests**. Focused regressions cover uncertain/denied readback, exact-session single-use proposals, per-target locks and native identifier aliases, fresh authorization before cached receipt disclosure, persistence and revision conflicts, source ownership, partial-capture drift, calendar/leap-day validation, preserved human review timestamps, report escaping, next-period reset semantics, read-only workbench boundaries, log timestamps/duplicate windows and spreadsheet-safe exports. `npm audit` reports zero vulnerable dependencies at this checkpoint.

The installed gateway was rebuilt September 27 before these native suites passed: `test:install`, `test:live`, `test:workflows`, `test:authorization` and `test:access`. Authorization probes now use reviewed mutations and separately assert that the raw-write bypass returns 409. Disposable users/roles and native records are cleaned up by the suites. Gateway installation tests are not a claim that a new IRIS volume was created; the existing native volume was preserved.

Additional actual gateway checks verified campaign creation/capture/revision conflicts/relogin/archive, reviewed resource creation/edit/deletion with readback, replay rejection and raw-write rejection. A native certification check confirmed invalid-calendar-date rejection, a captured SuperUser decision, stale-capture conflict, unchanged-evidence carry with its original review timestamp, a fresh next-period campaign containing settings but no old evidence or decisions, and persistence after relogin. Both verification campaigns were archived afterward. These checks exercised the supplied IRIS Community instance; IRIS for Health and external identity-provider login flows remain untested.

September 27 browser checks on the real rebuilt gateway verified Explain access for Admin → `%Admin_Operate` Use through the ordinary `%Manager` path, an archived campaign with one retained SuperUser certification and its reason, and a report that correctly distinguished complete certification from 19 outstanding finding decisions. Desktop and 390-pixel viewport checks found no document overflow (375-pixel client and scroll widths). Inspected console errors and warnings were empty. Proof images are `docs/images/explain-access-desktop.png`, `explain-access-mobile.png`, `certification-desktop.png`, `certification-mobile.png`, `campaign-report-desktop.png` and `campaign-report-mobile.png`. The final copy/CSS pass corrected certification label spacing and distinguished browser-only captures from durable campaign data. Existing screenshots and browser notes below belong to the earlier independent release unless explicitly dated otherwise.

## Historical independent release checkpoint

Verified September 26, 2026 on disposable IRIS Community 2026.2 build 221U. This record describes the current independent implementation; earlier review documents describe earlier revisions.

| Check                    | Current result                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| npm run check            | TypeScript, production frontend/server bundles and 95 tests pass.                                                       |
| npm audit                | Zero reported vulnerable dependencies at verification time; this does not audit the OS or IRIS image.                   |
| Clean native image build | The configure and install scripts compile the current extension successfully.                                           |
| test:authorization       | Limited native account, rejected escalation, database-read revocation and existing-session revocation pass.             |
| test:install             | Deployed static files, CSP, login, CSRF, info, native reads, extension and logout pass.                                 |
| test:live                | Native list/detail coverage, disposable CRUD and observation sources pass.                                              |
| test:workflows           | Users, wallet metadata isolation, complete task creation/control, OAuth configuration/credentials and async audit pass. |
| test:x509                | Disposable certificate creation/import/update/read/removal passes.                                                      |
| test:process             | Explicit demo worker suspend/resume/terminate passes; disappearance checked.                                            |
| test:access              | Native nested-role analysis, resource change detection and cleanup pass.                                                |

The replacement kept security and API regression contracts. Five tests for the removed Harbor-style presentation helper were retired with that helper. Lower totals than an earlier revision do not indicate that failing security tests were deleted.

## Browser verification

Current production builds were inspected at desktop and 390 × 844 widths. Separate localhost fixtures exercised a task update end to end: the browser sent only Description, preserved an externally changed SuspendOnError value, and refused a second write after an external Description conflict. A failed logout kept the authenticated view and showed the error. Fixture writes never reached IRIS.

The real native suites and these isolated UI checks test different boundaries. They do not certify every combination of administrator configuration or every browser. Current screenshots are under docs/images; old screenshots remain historical illustrations where named accordingly.

## Reproduction

Run npm ci and npm run check in this repository. Native scripts require a disposable local instance and IRIS_TEST_USER, IRIS_TEST_PASSWORD and IRIS_URL. On the reviewed host use http://127.0.0.1:52780 for IRIS and PORTAL_URL=http://127.0.0.1:3200, PORTAL_ORIGIN=http://localhost:3200 for the gateway. The origin must match PUBLIC_ORIGIN even if transport uses a different loopback address.

Run test:install, test:authorization, test:live, test:workflows and test:access. For X.509 set IRIS_TEST_CERT to a disposable PEM path inside the container. For process control run iris/start-test-worker.script and pass the printed PID as IRIS_TEST_PID within two minutes. The suite refuses any process whose routine does not identify Atlas.DemoTask.

Installation failure paths were tested in separate native sessions: both a failing status and an unexpected runtime exception exited with code 1 before the subsequent success marker. Error traps are set on the same direct-mode command as the protected operation.

## Limits and retained evidence

IRIS for Health and a complete external identity-provider authorization flow were not tested. Host observations are not container quotas. The earlier volume-replacement persistence checks remain historical evidence; the current native image build did not delete or replace the live data volumes. No public GitHub/Open Exchange publication or contest submission was performed.

See PROVENANCE.md, CONTEST_SECURITY_REVIEW.md and DEPLOYMENT.md for origins, boundaries and deployment prerequisites. Test resources are temporary and cleaned up by the native scripts.

## Final independent release verification

September 27 addition: five duty-rule regressions cover inherited paths, cycles, conditional escalation, unreadable accounts, absent definitions, disabled accounts and bounded rule validation. The complete set now has 95 tests. The form was exercised on a real capture and inspected at desktop and 390 × 844 widths. Rules are local configuration evidence, not access enforcement. Existing fixture write/conflict/logout results and native access-graph tests remain complementary evidence.
