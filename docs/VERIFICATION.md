# Verification record

## Finding follow-up navigation — September 28, 2026

A finding in Report & follow-ups can open its exact decision form. Returning retains the agenda search, source filter and report options because the report stays mounted within the selected campaign. The existing form still requires an explicit save; navigation performs no native write or decision mutation. A different campaign gets its own report state. The return control is disabled during a pending campaign mutation.

Production browser checks used the retained September presentation campaign: filter SuperUser/finding, open the correct existing decision with heading focus, and return to the same one-row filter. Desktop and a390px frame passed; mobile document width/scroll width were390/390. No decision was saved during these navigation checks. Production build and the219 existing regressions pass. These responsive checks do not claim physical touchscreen coverage.

## Certification pagination — September 28, 2026

With31 pending objects, saving the only decision on page2 shortened the pending list to30 but left the UI on an empty page showing31–30. The list now clamps the displayed page to the available range; zero matches also have an explicit empty state. A regression exercising the actual component failed before the fix and passes afterward, including the zero-result case.

Browser QA used the actual CertificationReview and shared certification model with31 synthetic accounts, an in-memory save callback and no native/API operations. Desktop and a390px frame both returned to1–30 of30 after recording Account31, disabled both page buttons and retained the saved-decision receipt. The mobile document remained390/390px. Full production build and219 tests passed.

## Report preview and initial loading — September 28, 2026

Reports can now be previewed before export. The preview uses the same escaped standalone HTML renderer as downloads inside an empty-sandbox iframe (no scripts, origin access, forms or navigation permissions). Closing the dialog restores focus to Preview report. Metadata becomes a single column on narrow screens so timestamps do not widen the report.

Browser checks passed on the production build with a retained native capture: desktop report content and close/focus behavior, and a 390px same-origin application frame with document width/scroll width390/390 and dialog355/355. The report's own opaque sandbox remained enabled. This is responsive-layout verification, not a physical-device test. The18 report/review regressions include hostile notes and scope escaping; the complete build and218 tests passed again after the changes.

The main client entry decreased from744.27kB to240.26kB (approximately68%, uncompressed build output) by deferring the review and administration workspaces. Their code still downloads when opened. A rejected lazy-module fixture displayed a recoverable error with Reload application, rather than an empty application. This measures generated assets, not a claimed network or interaction benchmark.

The first-review guide and example HTML/Markdown report use bundled IRIS accounts and explicitly show unfinished work. They contain no credentials. The report is an example, not a security certification.

## Review form navigation — September 28, 2026

Opening a finding decision or account certification now focuses its heading and brings the form into view. Previously the form appeared below the full results list, often outside the viewport. Reopening the selected item preserves its draft. Current saved decisions display their outcome, timestamp and follow-up date beside the form; stale decisions are not labelled current. Native writes and campaign authorization are unchanged.

Production build and the existing 218 tests passed. Browser checks exercised the retained campaign against the isolated presentation gateway: desktop heading focus/visibility, a 390×844 same-origin frame with no horizontal overflow, and preserving an unsaved finding note when reopening its item. The frame was used because the browser tool ignored its viewport override; this is responsive-layout testing, not a physical touchscreen test. Test notes were cancelled, not saved into the campaign.

## Saved campaign entry after capture failure — September 27, 2026

The existing Access review navigation now keeps Campaigns available before any ad hoc snapshot succeeds. Other tabs remain disabled until a snapshot is returned, and the capture error and explicit retry remain visible. This addresses whole-request failures, including a browser reload during the session's five-second capture cooldown; individual native-source failures already return a partial snapshot with warnings and did not cause this navigation block. No campaign backend or permission checks changed.

Four actual-component regressions exercise AccessReview, Campaigns and its existing saved-evidence read handler with controlled transport. They cover initial 503 and 429, partial HTTP 200, explicit campaign list/detail GETs without another snapshot request, successful later capture without leaving the campaign, and a separately refused campaign read returning 403 without saved rows. Full production builds and **198 tests** pass. These checks use synthetic responses, not native IRIS or existing campaign files. The isolated production-build fixture is ready for separate desktop/mobile browser validation.

## Remediation recovery visibility — September 27, 2026

A mobile reproduction showed that failed remediation left its recovery instructions above the viewport. The labelled recovery block now receives focus and scrolls into view once per failed review ID, after the request settles; reading history or rerendering does not steal focus. ConfigurationDesk's tested short proposal was already visible and is unchanged. One focused actual-component regression brings `npm run check` to **190 passing tests**, with production builds passing. See [the visibility finding and scope](APPLY_RESPONSE_RECOVERY.md#recovery-visibility-on-mobile).

Production browser verification passed mobile 375×844 after a truncated established response and desktop 1265×900 after an exact HTTP 400 refusal. The recovery block was visible and focused; mobile Tab reached Reload remediation history, and its read-only reload displayed the verified record without focusing the block again. The respective fixtures recorded one accepted synthetic change and zero accepted changes, each from one Apply attempt; neither connected to IRIS. Evidence: `research/atlas-recovery-focus-browser.json` and `research/atlas-recovery-focus-mobile-state.json`, with visibility screenshots referenced in the recovery document.

## Lost apply response recovery — September 27, 2026

Configuration and remediation Apply controls now prevent repeated submission of an attempted review ID. Missing/unreadable/5xx responses display uncertainty, the review ID and an explicit read-only recovery action; exact 4xx refusals remain distinct. Drafts are preserved and the remediation proposal is no longer called unsubmitted after an attempt. Five actual-component regression groups bring `npm run check` to **189 passing tests**, with production builds passing. See [recovery behavior and validation boundaries](APPLY_RESPONSE_RECOVERY.md). Browser integration uses synthetic accepted changes; no IRIS operations were performed.

Production browser checks on the isolated port 3439 fixture passed configuration receipt recovery and campaign history reload after a truncated HTTP 200 response. Drafts and consumed-review guards survived the reads; desktop/mobile layout passed. The final integration artifact `research/atlas-apply-established-response-browser.json` records two apply requests for two distinct accepted synthetic changes, with zero native connections. The earlier pre-header disconnect observation is explicitly distinguished in the recovery document.

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

IRIS for Health and a complete external identity-provider authorization flow were not tested. Host observations are not container quotas. The earlier volume-replacement persistence checks remain historical evidence; the current native image build did not delete or replace the live data volumes. This historical test round preceded publication. The repositories and Open Exchange submissions were subsequently published; see the README links.

See PROVENANCE.md, CONTEST_SECURITY_REVIEW.md and DEPLOYMENT.md for origins, boundaries and deployment prerequisites. Test resources are temporary and cleaned up by the native scripts.

## Final independent release verification

September 27 addition: five duty-rule regressions cover inherited paths, cycles, conditional escalation, unreadable accounts, absent definitions, disabled accounts and bounded rule validation. The complete set now has 95 tests. The form was exercised on a real capture and inspected at desktop and 390 × 844 widths. Rules are local configuration evidence, not access enforcement. Existing fixture write/conflict/logout results and native access-graph tests remain complementary evidence.

Integration browser result: production client passed wallet keyword matching, mixed case and extra spaces, no-results feedback, Escape/reopen reset, actual initial input focus, Ctrl K and explicit navigation. Escape restored focus to the opener. Desktop1280×900 and phone390×844 passed (phone document/scroll width375/375). The synthetic session/read fixture performed zero native operations or writes; this is a bounded interaction check, not a complete accessibility audit.

## Existing-instance configuration validation — September 27, 2026

The bounded deployment review found two startup mismatches: IRIS_URL accepted a path prefix that fixed native URL construction discarded, and HTTP PUBLIC_ORIGIN accepted COOKIE_SECURE=true. Startup now rejects both before opening a listener. Two regressions cover invalid prefixes, both contradictory cookie/origin combinations, valid root origins, loopback development and HTTPS deployment. Build and184 Node tests pass. The original routing observation used a synthetic transport and no IRIS connection; no installer, native data, environment file or volume was changed. No browser UI changed in this correction. Harbor/Waypoint already had the corresponding guards and required no edit.

Production-client integration for saved-campaign entry passed desktop1280×900 after first snapshot503 and phone390×844/375 after429. Saved list and detail opened independently, with the capture error still shown. An explicit partial200 capture recovered configuration tabs without navigating away from the selected campaign. With campaign reads separately denied403, a fresh mobile page showed the permission error and no saved row/detail. Fixture counters: four snapshot requests, three campaign lists, two details, zero mutation attempts and zero native connections. Evidence: atlas-campaign-entry-browser-state.json and desktop/mobile/denied-mobile screenshots in research outside the submission. These checks exercise synthetic transport and the production client; existing server authorization probes were not modified.
