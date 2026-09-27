# Saved evidence after a refused read

Reloading a campaign previously left its selected detail, captures and report exports available after the gateway explicitly refused that GET with HTTP 403. A forbidden campaign reload now removes that campaign and its cached index entry, unmounting the detail and its exports. A forbidden list read clears the list only. Reading a different refused campaign does not discard an already selected, separately permitted campaign.

Temporary read failures retain the previous campaign object, so the same detail component keeps its unsaved settings and review notes. Session receipt refresh now likewise retains the selected receipt on a 500 response. An explicit receipt-list 403 clears the list, selected receipt and exports. Successful receipt refresh preserves the selection if that receipt still exists.

Generation checks remain in place: an obsolete success or failure cannot replace or clear a newer selection. These changes apply to the specified GET requests. They do not interpret rejected campaign mutations as proof that previously readable evidence is forbidden. Ad hoc capture behavior is unchanged; capture sources return explicit incomplete-evidence warnings.

## Verification, 27 September 2026

Four new tests exercise the actual saved-evidence reader with refused reads, temporary failure, current success and obsolete responses. The combined production build and **156 tests passed**, including the separately reviewed three regressions for boolean security flags. `ChangePassword`, `PasswordNeverExpires` and `HOTPKeyDisplay` remain visible when their values are booleans; other value types and actual credential fields remain masked. Native IRIS data and volumes were not modified.

The build retains its existing non-failing Vite warning about the main bundle size and snapshot-schema import placement.

## Isolated browser scenarios

The workspace-only `research/atlas-protected-read-fixture.cjs` serves the production bundle at `http://127.0.0.1:3410`. It stores no data, connects to no native server and applies no writes. It must be started explicitly after inspection. Controls persist until changed through `POST /_test/control`; `GET /_test/state` reports requests and zero applied writes.

1. At `#atlas`, select Campaigns and open Protected review campaign. In Settings, edit Scope and review period without saving. Set `{"campaignDetailStatus":500}` and click Reload campaign: the draft and previous campaign remain visible with the error.
2. Set `{"campaignDetailStatus":403}` and reload again: the campaign, saved captures and exports disappear. Restore detail status to 200 and refresh the list to reopen the record.
3. Set `{"campaignListStatus":403}` and choose Refresh list: only the refused index is removed. The selected detail has its own Reload campaign action for independently checking that record.
4. At `#permissions`, choose Session receipts, then Inspect receipt. Set `{"receiptStatus":500}` and refresh receipts: selection and recorded differences remain. Set receiptStatus to 403 and repeat: the receipts and their exports disappear.
5. Repeat the visible cases at desktop and narrow viewport widths. Controls also accept read status 200 or 401, and `writeStatus` 403 or 500; fixture mutations always fail and apply nothing.

Browser evidence is recorded separately by the integration reviewer. These cases concern the current UI and do not attempt to revoke previously exported files.

Integration browser checks passed: campaign GET500 preserved an unsent Scope and review period draft and export; GET403 removed its selected detail/export on desktop. On mobile, receipt GET500 preserved the selected record/export, while403 removed both (375 CSS pixels client and scroll width). The fixture applied no writes. After rebuilding the existing gateway, a real native account read displayed the three policy flags as Yes/No; desktop/mobile evidence is retained in the workspace's `research/atlas-policy-flags-*.png`. No account policy was changed. Denied-read evidence is in `research/atlas-protected-read-browser.json` and `atlas-protected-read-*.png`.
