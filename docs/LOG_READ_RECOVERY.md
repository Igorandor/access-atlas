# Log read refusal recovery

Verified September 27, 2026.

Refreshing a loaded log source after an explicit 403 previously stopped automatic refresh but retained the capture, baseline, selected record, review notes and JSON/CSV export controls. The component now removes that source's protected evidence after the refusal. The query and text-filter drafts remain available. A temporary 500 retains the loaded evidence and annotations so the reviewer can retry without losing work. Existing 401 handling still ends the session.

The correction applies only to the current request generation and matching capture/baseline source. Source tabs are disabled while a read is pending; the existing generation check also discards a delayed response if a previously queued source-change callback has already switched the view. These guards were retained rather than replaced.

Three regressions execute the actual LogReview component and its form/button callbacks with deterministic hook state and transport responses. They cover 403 evidence/export invalidation and later recovery without an old baseline or notes, 500 preservation, and delayed successful/denied replies after a source change. They are component callback tests, not mounted DOM tests; production browser verification is recorded by integration. TypeScript, production builds and **173 tests** pass with `npm run check`. No native operation was needed.

Integration browser proof on27 September2026 used the production client and synthetic read-only fixture3418. Load500 retained the selected entry, Review note, baseline and both exports. Load403 removed the capture/detail/note/baseline and exports; a fresh200 read returned with an empty note and disabled comparison. Desktop1280×900 and phone390×844 (375/375) passed. Evidence outside the submission: research/atlas-log-recovery-desktop.png and atlas-log-recovery-mobile.png. Fixture stopped; gateway rebuilt without native data/policy changes.
