# Verification record

## Duty-rule draft after refused save — September 29, 2026

Release 1.2.8 retains the title and role choices when adding a campaign duty rule is refused. The title clears only after a confirmed save. An unavailable campaign-list refresh after that save is reported separately and does not invite a repeated addition. Pending fields are locked, repeated add callbacks are guarded, and a late result cannot clear a replacement draft or snapshot. Standalone rules still save in page memory.

Production build and 300 tests pass, including three actual parent/detail regression cases for refusal, success and success followed by a failed list refresh. Ten browser checks cover those cases, pending controls, local rules, replacement drafts and callback errors. Run `node scripts/test-duty-rule-browser.mjs` and open its printed URL.

Manual desktop and 390px checks confirm retained fields after refusal, successful deliberate retry and correct saved-state reporting after a list failure. The page fits both tested widths (1280px and 390px), and keyboard focus reaches the role selector. Transport and campaign records are synthetic; no native calls or durable writes occurred.

## Expired session during SQL refresh — September 29, 2026

Release 1.2.7 ends an established Atlas session when its session refresh returns HTTP 401, including an unreadable response body. The existing App handler removes the cached workspace and shows sign-in. Initial unauthenticated discovery remains quiet; 403 and transient 503 responses do not end the session. Responses from an older session remain unable to sign out a newer account. There is no automatic retry, and previously downloaded files are unaffected.

Build and 297 tests pass. Three new session-boundary regression groups check token clearing and the cross-tab signal, initial discovery and other statuses, and delayed responses after a newer login. Eight actual App browser checks verify retained SQL evidence for 403/503, removal and sign-in for parsed/unreadable 401, and no repeated SQL reads after those refusals. Run `node scripts/test-sql-session-refresh-browser.mjs` and open its printed URL.

Manual desktop and 390px checks confirm a temporary failure preserves the dated capture and export control, while an expired session returns to the real sign-in form with focus on the username. The phone sign-in panel fits 390px. All transport and records are synthetic; no native calls, stored records or real credentials were used. The before proof used the actual connection and SQL component; the final browser checks also mount the actual App.

## Certification export context — September 29, 2026

The standalone certification JSON now includes campaign identity and revision, export time, capture label/start time, exact source warnings and relevant limits. Existing keys and coverage remain intact; it exports the saved scope rather than unsaved scope edits. A before test reproduced complete:false with only a generic unknown-source notice while the exact application-inventory refusal was omitted.

Markdown finding and certification sections retain human review dates, decision capture IDs and follow-up dates. Outdated decisions are explicitly labelled, and per-object evidence warnings remain present alongside saved reasoning. This also works with Activity excluded. Carried decisions keep their original human review dates; no new approval is inferred. Before evidence showed these details in HTML/JSON but absent from Markdown.

Production build and 294 tests pass, including Markdown dates, outdated decisions, unknown evidence and escaping. Ten actual-component browser checks verify generated JSON/Markdown payloads, source warnings, identity/timing, saved rather than dirty scope, original carried review dates, escaped labels and optional-section exclusion. Run `node scripts/test-export-context-browser.mjs` and open its printed URL. Manual desktop and 390px checks exercise both export buttons and inspect the generated text; client/scroll widths match at1280px and390px. Transport and records are synthetic; no native calls or durable writes occurred. Downloads were intercepted as generated Blobs for inspection, not certified as browser file-save completion.

## Recovering campaign creation — September 29, 2026

Release 1.2.5 retains the attempted campaign title and next-period source when creation cannot be confirmed. Both creation entry points remain blocked until an explicit history read and operator acknowledgement. The existing campaign list is refreshed with filters cleared and archived records included; no record is automatically selected or matched. Failed or malformed history cannot authorize another creation. A later ordinary list refresh invalidates the previous acknowledgement, including on failure. Known successful creation followed by a failed list refresh remains reported as saved.

Build and 292 tests pass, plus 19 actual-component browser checks. They cover transport, malformed success and server failure; definite refusal; synchronous duplicate submits; both entry points; retained next-period fields; failed, malformed, empty and denied history; acknowledgement invalidation; known save/list failure; and the existing source-revision confirmation. Before fixtures reproduced two distinct ordinary records and two distinct next-period children after repeated submissions around lost responses. No native or durable writes were made.

Manual desktop and 390px checks confirm retained title/scope, reset list filters, no automatic selection, blocked repeat after history succeeds, inline read failure, and explicit acknowledgement before another attempt. Next-period title, description and reviewed source survive the history read. Client/scroll widths are 1280/1280 and 390/390px. The guard remains in page memory, not across a full browser reload; it is not server idempotency or a native-authorization certification.

## Certification carry-forward preview — September 28, 2026

Release 1.2.4 previews eligible decisions and reasons for omissions before carrying them to the latest capture. The preview and mutation share the same eligibility planner; saved scope, capture identity, evidence completeness, unchanged configuration/dependencies and retain/exception outcomes remain required. Original human review dates and revision protection are preserved. Incomplete captures show a single explanation without presenting an assessed count.

Build and 292 tests pass, plus 17 actual-component browser checks covering no automatic save, source selection, unchanged evidence, omitted outcomes, current decisions, refused and pending saves, revision binding, preserved review dates, repeated actions, saved versus edited scope and pagination. Manual desktop and 390px checks confirm readable preview/reasons, retained state after refusal, successful carry, and ten-row pagination for 31 decisions. Incomplete evidence blocks carry with one global warning. Client/scroll widths are 1280/1280 and 390/390. All records and transport are synthetic with no native or durable writes; these are responsive-browser checks, not physical-device or native-authorization certification.

## Remediation proposal basis — September 28, 2026

Release 1.2.3 binds prepared remediation to the returned campaign, capture and revision. Changed evidence clears confirmation and blocks the old proposal synchronously; returning old data does not reactivate it. The reviewed values remain separate from the recalculated draft, with the target and reason visible. Explicit return preserves the reason and focuses the remediation heading. Consumed reviews keep their separate result-recovery controls. Proposed-value columns are labelled explicitly in remediation and the configuration register; actual drift comparisons retain their existing labels.

Build and 287 tests pass, plus 19 actual-component browser checks covering preparation, unchanged reloads, changed captures/revisions, stale callbacks, missing findings, explicit re-review, confirmed success, uncertain outcomes, read denial and focus. Tests use synthetic records and transport without native or durable writes. Server authorization and live field-drift checks are unchanged; the reproduced UI mismatch is not evidence of a backend bypass.

Manual desktop and 390px checks confirm cleared confirmation, blocked stale Apply, retained reason, revised expected roles after a new review, and heading focus followed by Tab to Finding. Unknown-response recovery survives a later reload without enabling Apply. Initial phone review measured 390/397px; bounded campaign grid tracks correct it to 390/390px. Desktop measures 1280/1280px. Configuration-register proposed headers were separately checked at both widths. Build passed after the CSS-only adjustment. These are responsive-browser checks, not physical-device tests; ticket expiry was not exercised.

## Certification draft revisions — September 28, 2026

Release 1.2.2 binds each certification draft to its subject, capture and campaign revision. A reload that changes this basis preserves edited values and blocks submission, including programmatic submission. Use saved decision explicitly adopts the current record. Unedited forms and matching saves on the same capture follow the current revision normally. When an object leaves scope, its unsaved values remain readable until explicitly discarded; disabling certification does not hide this recovery control.

Build and 283 tests pass. Twenty-three actual-component browser checks cover changed captures, concurrent decisions, unchanged reloads, matching saves, removed subjects, disabled scope, navigation guards, refused saves and read-access recovery. Manual desktop and 390px checks confirmed focus on the conflict, preserved text, explicit reset and submission against the new capture/revision, and readable out-of-scope notes. Documents measured 1280/1280 and 390/390 client/scroll width. All records and saves were synthetic and in memory, with no IRIS or durable writes. These checks do not certify native authorization or physical-device behavior.

## Incomplete role evidence — September 28, 2026

Release 1.2.1 distinguishes missing or unreadable reachable role definitions from complete definitions with no grants. Matrix cells retain known grants beside a question mark, and their explanations list the unread definitions. Proven paths to %All stay visible. The removal preview retains limitations from the original assignment, including when the unread role is unchecked, and counts only known grant changes. Cycles among readable roles and unrelated unread roles do not make an account's evidence incomplete.

Build and 280 tests pass. Twenty-four actual-component browser checks cover missing and denied roles, known grants and proven broad paths alongside unknown evidence, readable cycles, unrelated failures, unread accounts with stale fields, and complete empty roles. Ten built-example browser checks pass with zero backend requests. Manual desktop and 390px checks confirm readable explanations, retained baseline warnings and known grants; both phone views measure 390px client/scroll width. All records were synthetic, with no native or durable writes. These checks do not certify runtime authorization or physical-device behavior.

## Isolated interactive access example — September 28, 2026

Release 1.2.0 adds a separate static example using the actual AccessMap and ResourceMatrix components with a validated synthetic snapshot. Removing SupportTeam removes W while ReportingReader retains R; reset restores RW. The matrix retains the original capture and separates public permissions from explicit account grants. The example has no login, native API client or campaign persistence. The installed portal does not fall back to training data.

Normal build and276 tests pass, including three example regressions for alternate grant paths, public permissions and the dependency boundary. The example build succeeds. Ten built-artifact browser checks cover role removal, both paths, reset, original-matrix retention, explanation dialogs and zero attempted backend requests. Final manual desktop and390px checks cover keyboard activation, the remaining read path, reset, public-permission explanation and dialog dismissal. The phone document measures390px client/scroll width; the named matrix region scrolls from0 to535px using arrows, exposing the final column. An initially expanded guide placed the controls below the first screen; it is now a closed, keyboard-accessible walkthrough.

The example dependency graph excludes the connected App, API, hooks and server modules. Production assets contain no training account/resource identifiers. The static artifact uses local assets, includes dependency license notices, and sets connect-src and form-action to none. Only dist-example is published. These are synthetic browser checks, not native authorization or physical-device certification.

## Narrow HTML report tables — September 28, 2026

Release 1.1.8 gives wide standalone HTML report tables a minimum readable column width on screens up to600px. Each wide table has a named focusable scrolling region and a narrow-screen hint. Three-column review status, desktop widths, print width rules, report values and CSP remain unchanged.

Build and25 existing report/domain regressions pass. Root browser checks used a full synthetic report with all five wide sections populated. At390px, the document stayed375px wide with its scrollbar; the agenda region was343px wide and its822px table scrolled from0 to478px using arrow keys, exposing the final note column. On desktop all five regions measured1100px client/scroll width and no scroll hint was displayed. The screenshot check confirmed readable notes and intact headings. No native or stored data was changed; physical-device and printer behavior were not exercised.

## Historical decision evidence — September 28, 2026

Release 1.1.7 makes the saved reason, follow-up date, review time and capture identifier visible for historical certification and finding decisions. Both activity views use an expandable evidence display. The selected report activity section includes those historical facts in JSON, Markdown and HTML without replacing them with current decisions or exporting the internal finding fingerprint. Excluding activity also excludes its saved decision details. Existing records without snapshots remain readable without invented evidence.

The build and 273 tests pass, including six new regressions for historical/current separation, section selection, HTML/Markdown escaping, absent evidence, the 1000-entry bound and the actual shared React component. After final text/layout adjustments, build and the six focused regressions passed again. Desktop browser checks opened both certification revisions with distinct reasons/dates. At390px, report Activity exposed the original saved decision with no document overflow (390px client/scroll width). Manual review found the first HTML activity table too cramped on a phone; it was replaced with responsive revision sections and rechecked. The exported report frame had375px client/scroll width inside the390px frame due to its scrollbar. All fixtures used synthetic validated records with no native or durable writes. These responsive checks are not physical-device or printer coverage.

## Filtered follow-up CSV dates — September 28, 2026

A report left open across UTC midnight could export an empty Overdue only CSV while a fresh JSON report from the same campaign revision contained the newly overdue follow-up. CSV now evaluates the current campaign at export time, applies the same source, text and overdue filters as the agenda, and refreshes the displayed date-based counts. All matching rows are exported, including later pages; the selected page and filters remain in place. Export failures are shown and an explicit retry can recover.

Build and all 267 tests pass. Four new actual-component regressions cover midnight, updated campaign notes, filtering and CSV escaping, pagination and export failure/retry. Six browser checks passed with the actual report and domain model, a controlled UTC clock and synthetic records. Manual desktop and 390px checks confirmed the current note and overdue status with preserved filters; the phone document measured 390px client and scroll width. Payloads were captured in memory, without real downloads, API calls or native writes. Responsive browser coverage is not a physical-device test.

## Global navigation from review dialogs — September 28, 2026

Opening a campaign report preview, using Ctrl+K and selecting Logs left a native modal open inside the hidden review workspace. The invisible modal made the new workspace inert; clicking Review did nothing. The retained review now suspends its dialogs when another workspace is selected. Nested boundaries combine their suspension state, so an active campaign cannot override a hidden parent. Returning restores the same preview and in-memory note without a save or native write. The tool finder also recognizes SQL and grant keywords.

Build and 263 tests pass, including regressions for workspace suspension, inherited modal state and SQL discoverability. Real App, campaign and modal components with production styles passed desktop and 390px checks using synthetic transport. Logs had no active modal after navigation; both a normal Review click and the tool finder restored the preview, keyboard focus and exact reviewer note. The phone dialog measured 356.4px in a 390px viewport with no horizontal overflow. This is responsive browser coverage, not a physical-device test. No stored campaigns, grants or IRIS data were changed.

## Overdue follow-up summary — September 28, 2026

The campaign header counted only overdue unresolved finding decisions, so it could display zero while Report & follow-ups showed an overdue certification or a scheduled review of an accepted finding. It now counts the same agenda used by the report. Three actual-component regressions failed before the change and pass for a certification exception, an unreviewed subject with a scope deadline and an accepted finding with a follow-up date. The narrower finding filter, decisions and deadlines are unchanged. Build and 261 tests pass. Three additional actual parent/report regressions cover crossing UTC midnight before Refresh dates, first opening the report and exporting fresh evidence. The report notifies the parent of its exact evaluation time without a background timer. Desktop and 390px actual-component checks showed matching counts and all three due entries; desktop Refresh dates retained agreement. All records were synthetic, with no API or native writes.

## Campaign authorization changes — September 28, 2026

A denied campaign list now clears the selected campaign and nested exports, consistent with the route-wide read permission. A mutation403 separately rechecks the selected campaign: allowed access retains edits, GET403/404 clears the workspace, and temporary failure hides evidence and exports while preserving drafts in memory. A newer read revision does not silently rebase or erase an edited decision; the reviewer must reload. Scoped modal suspension explicitly closes native top-layer dialogs during the check. Successful writes followed by a list error stay reported as saved and retain their result, avoiding an invitation to repeat the operation.

Production build and 255 tests pass, including sequence guards, finding draft retention, confirmed-save handling and modal lifecycle. Actual campaign components with production styles passed desktop and 390px checks: list500 retained edits; list403 cleared detail/export; mutation403 followed by GET200 preserved the scope; GET503 hid it until a successful retry restored the exact draft; GET403/404 removed the campaign. A separate real-browser ModalBoundary fixture confirmed that suspension sets the native dialog to closed and hidden, and restoration reopens the same edited draft. These checks used synthetic transport and made no native or durable writes. Already exported copies and draft persistence after reload/logout are outside this change.

## Markdown remediation evidence — September 28, 2026

Markdown reports previously included a remediation's status and message but omitted its update timestamp, checked fields and reconciliation note, which were already present in HTML. Markdown now retains that evidence when the remediation section is selected. The regression failed before the fix and passes afterward; it also verifies literal escaping of a hostile reconciliation note and omission of the whole optional section when deselected. Production build and all 226 tests pass. Native writes and the HTML/UI renderer are unchanged.

## Workspace failure isolation — September 28, 2026

A controlled Logs rendering failure exposed a navigation bug: switching to the otherwise healthy REST workbench retained the previous error boundary state. Each transient workspace now has its own boundary identity. The retained access review remains mounted separately so ordinary navigation still preserves its capture.

An isolated browser fixture used the actual App, shell, lazy loading and error boundary with synthetic workspace components and no API calls. Before the fix, Logs → REST workbench still showed the error. After the fix, the REST workspace rendered successfully without reloading the application, on desktop and in a 390px frame. The error remains visible when the failing workspace itself is selected.

## Certification follow-up navigation — September 28, 2026

The follow-up agenda now opens the exact certification subject, including an existing decision and its follow-up date. The list shows all objects on that entry path so an already reviewed subject remains visible. Returning preserves the report search and source filter. Switching objects protects edited decisions; returning also protects a changed certification scope. Keeping or discarding a draft performs no save or native operation.

Production build and all 225 tests pass. Three added regressions cover saved-value initialization (including a colon in the object name), unchanged return, keeping/discarding edited decisions, scope protection and an absent subject. Browser checks exercised the real campaign detail, report, certification component and shared model with synthetic accounts, on desktop and in a 390px frame. Both opened AccountA with its saved note/date and focused heading, preserved an edited note with Keep editing, and returned to the original single-row filter after explicit discard. Save calls remained zero. No global navigation or physical-touchscreen coverage is claimed.

## Unsaved finding decisions — September 28, 2026

Cancelling a finding decision, opening another finding, or returning to follow-ups now asks whether to keep editing or discard a changed draft. Reopening the same finding keeps its draft without a prompt. Closing the dialog or pressing Escape keeps the draft; discarding never saves. This guard does not cover global workspace/campaign navigation or browser unload, so the guide still instructs reviewers to save before leaving those views.

Three regressions exercise the actual parent and form components: unchanged navigation, preserving/discarding a draft, and same-finding versus different-finding navigation. Production build and all 222 tests pass. Browser checks used the actual component and shared model with synthetic accounts and no API calls. Desktop checks covered Keep editing, Cancel/Escape and changing findings; a 390px frame preserved the draft and returned to follow-ups after explicit discard, with zero save calls. The dialog fits the frame (356.4px width, 355px scroll width). These are responsive checks, not physical-device coverage.

The README overview and first-review guide screenshots are unaltered frames from the current recorded walkthrough; they show a presentation campaign and are not live service data.

## Finding follow-up navigation — September 28, 2026

A finding in Report & follow-ups can open its exact decision form. Returning retains the agenda search, source filter and report options because the report stays mounted within the selected campaign. The existing form still requires an explicit save; navigation performs no native write or decision mutation. A different campaign gets its own report state. The return control is disabled during a pending campaign mutation.

Production browser checks used the retained September presentation campaign: filter SuperUser/finding, open the correct existing decision with heading focus, and return to the same one-row filter. Desktop and a 390px frame passed; mobile document width/scroll width were390/390. No decision was saved during these navigation checks. Production build and the219 existing regressions pass. These responsive checks do not claim physical touchscreen coverage.

## Certification pagination — September 28, 2026

With31 pending objects, saving the only decision on page2 shortened the pending list to30 but left the UI on an empty page showing31–30. The list now clamps the displayed page to the available range; zero matches also have an explicit empty state. A regression exercising the actual component failed before the fix and passes afterward, including the zero-result case.

Browser QA used the actual CertificationReview and shared certification model with31 synthetic accounts, an in-memory save callback and no native/API operations. Desktop and a 390px frame both returned to1–30 of30 after recording Account31, disabled both page buttons and retained the saved-decision receipt. The mobile document remained 390/390px. Full production build and219 tests passed.

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

Verified September 26, 2026 on disposable IRIS Community 2026.2 build 221U. Each dated entry records the version and checks available at that time.

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

## SQL privilege evidence — September 28, 2026

The SQL review reads object and administrative grants independently, with a fixed 500-row cap per source, typed row validation and explicit partial/unavailable outcomes. Unit tests cover partial errors, empty/malformed replies, ambiguous aliases, unknown flags, column indicators, row caps and query scope. A session integration test identifies the configured instance without collecting the resource graph.

Read-only probes against the existing IRIS 2026.2 instance passed for both endpoints (five rows each). The live UI returned 500 bounded object rows and 31 administrative rows for SuperUser in USER; the object source correctly warned of possible truncation. Native Object/Action fields differ from the bundled OpenAPI Name/Privilege fields; both explicit shapes are handled, conflicts omitted with a warning. An unknown grantee returned HTTP200 with an empty array, so the UI asks users to check its spelling/existence and never infers denied access.

Desktop browser checks passed live capture, filtering and returning from Access map with scope/results/filter retained. The downloaded JSON contained all 500+31 rows despite a 13-row local filter, correct instance/scope, source times and truncation flag. The browser download event listener timed out, but the actual downloaded file was independently parsed and checked.

A separate synthetic transport exercised partial source denial, malformed rows, column notices, unknown flags, scope changes and delayed replies. At 390px iframe width, document width remained 390, a 317px table scroller contained 700px of columns, and keyboard scrolling moved it 40px. This is browser-responsive verification, not a physical-phone test. No grants, accounts, tables or native data were modified. Only the existing portal container was rebuilt; IRIS and stored campaigns were preserved.

## Unsaved campaign drafts — September 28, 2026

Reproduced silent loss of an edited certification scope after switching to Activity and back, with zero save calls. Campaign tool navigation now asks before discarding an unsaved finding decision or certification scope/decision. Campaign replacement also protects review drafts and edited campaign title/description; failed replacement reads retain the current draft. Finding reload/new-capture paths are guarded where a revision change would remount the editor. Access-review tool switches keep the visited campaign mounted.

The production build and 241 tests pass, including six keyed-component lifecycle regressions for finding/scope navigation, Keep editing/Escape/discard, failed replacement reads and refused/successful saves. Browser checks with real components and a synthetic transport passed on desktop and 390px: scope and decision retained across SQL/Campaigns, explicit discard removed scope, failed saves retained protection, campaign replacement requested confirmation. The phone dialog fit 356px inside a 390px document without document overflow. No fixture request reached IRIS.

This does not persist drafts after logout/session expiry or browser reload/close. Unrelated remediation and next-period form drafts are outside this correction. Existing session isolation is unchanged.

## Next-period confirmation — September 28, 2026

Reproduced a confirmation from an earlier campaign revision remaining active after a source reload changed the certification scope. Confirmation now belongs to the source ID and revision, and the submit handler independently enforces it. A changed source requires a new review while retaining the entered title and description. Three actual-component regressions cover source changes, unchanged rerenders, edited inputs and submission guards. Build and all 244 tests pass.

Desktop and 390px browser checks used the real component with synthetic campaign props: changing Finance/excluded to AllDepartments/included cleared confirmation and disabled creation; entered text remained. Confirming the new settings submitted revision 2 to an in-memory callback. The full production styles kept the phone document at 390px with horizontal scrolling confined to the comparison table. No campaign or native operation was sent to a server.
