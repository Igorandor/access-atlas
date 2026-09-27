# Verification record

## Find a tool search — September 27, 2026

The existing tool dialog now opens with a labelled search input and filters the nine destinations by name and a short explicit keyword list. Matching ignores case and surrounding/repeated whitespace; empty results explain how to change the search. Query state belongs to the dialog and resets on close without browser persistence. Typing never navigates or executes an operation. The existing native dialog retains its focus containment and Escape behavior. `npm run check` passes production builds and the existing **182 tests**; browser verification of focus, matching, reset and responsive layout is recorded separately by integration. No mirror test or new dependency was added for this presentation change.

## Individual read cancellation — September 27, 2026

Premature client disconnection now cancels the individual native GET issued through `/api/iris`, while normal completion and audit POST retain their existing behavior. The caller signal preserves the 20-second deadline and is not propagated to shared captures or reviewed writes/readback. Five router/transport regressions bring `npm run check` to **182 passing tests**, with production builds passing. See [the confirmed wasted-read case, limits and exclusions](READ_CANCELLATION.md). All native responses were synthetic; no IRIS, trickling-stream or load tests were used.

## Native read hook recovery — September 27, 2026

Configuration list results now belong to a path/query key, so the first render of another scope cannot return the previous scope's data or collection time. Same-key 500 preserves prior evidence, while 403 and disabled paths clear it. Four actual-hook regressions bring `npm run check` to **177 passing tests**, including successful production builds. See [the confirmed behavior and scope limits](NATIVE_READ_RECOVERY.md). The optional polling branch is tested but has no current polling consumer; no native operations were performed.

## Log read refusal recovery — September 27, 2026

LogReview now removes the current source's capture, baseline, inspection, annotations and export controls after an explicit read 403. A temporary 500 retains the evidence and draft notes. Three actual-component callback regressions also verify stale-response rejection after source changes. `npm run check` passes production builds and **173 tests**. See [the confirmed issue and boundaries](LOG_READ_RECOVERY.md). Browser observations are recorded separately; no native operations were performed.

## Evidence field lookups — September 27, 2026

The evidence table and diff now distinguish missing fields from inherited JavaScript properties. The confirmed issue could display built-in functions or hide an added empty `__proto__` record. Three actual-component rendering regressions bring `npm run check` to **170 passing tests**, with production frontend/server builds passing. See [the correction and validation scope](EVIDENCE_FIELD_LOOKUPS.md). No native operations were performed.

## Client session boundaries — September 27, 2026

Late responses from an earlier account can no longer replace the current CSRF token or expire a newer login. Async polling stops before sending a previous session's job request, and same-origin session signals remove protected views in other tabs without transmitting account data or tokens. Duplicate initial session discovery remains compatible with StrictMode. Eight regressions bring `npm run check` to **167 passing tests**, with TypeScript and frontend/server production builds passing. See [the confirmed race, boundaries and test coverage](SESSION_BOUNDARIES.md). Browser integration evidence is recorded separately; these checks did not mutate IRIS.

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

Integration browser result: production client passed wallet keyword matching, mixed case and extra spaces, no-results feedback, Escape/reopen reset, actual initial input focus, Ctrl K and explicit navigation. Escape restored focus to the opener. Desktop1280×900 and phone390×844 passed (phone document/scroll width375/375). The synthetic session/read fixture performed zero native operations or writes; this is a bounded interaction check, not a complete accessibility audit.
