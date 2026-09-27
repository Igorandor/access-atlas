# Evidence field lookups

Confirmed and corrected September 27, 2026.

The shared evidence table gathers column names from multiple loaded records. If a record supplied a JSON field named `constructor`, `toString`, or `__proto__`, a second record without that field previously displayed its inherited JavaScript value. The diff renderer had the same problem: comparing an absent `__proto__` with an explicitly supplied empty record could hide the addition because the inherited prototype also serialized as an empty record.

DataView and DataDiff now read a field only when it belongs to that record. Missing fields display “Not supplied”; real supplied values remain visible. This is a correction to displayed evidence and comparisons, not a prototype mutation or an authorization bypass. Access analysis and snapshot import use separate Map/Set or array-based identity lookups and were not changed.

Three regressions render the actual components with React's server renderer. They cover mixed rows with reserved names, added/removed/unchanged reserved fields, and ordinary false/zero/empty/null/nested values. `npm run check` passes TypeScript, production frontend/server builds, and **170 tests**. An isolated browser preview imports the real components and Atlas styles; browser observations are recorded by integration. No native operation was needed.

Integration browser check on 27 September 2026 rendered the actual current components and project CSS with synthetic own/missing reserved fields. Desktop1280×900 and phone390×844 passed (mobile client/scroll375/375; wide tables retain their internal scrolling). Missing fields showed the project's missing-value label; supplied constructor/toString values remained readable. Both added and removed own __proto__:{} differences were visible. Search and record inspection passed. No inherited JavaScript function appeared. Evidence outside the submission: research/atlas-own-fields-desktop.png and research/atlas-own-fields-mobile.png. Preview3417 had no native/API transport and were stopped after inspection; temporary tabs27/28 closed, viewport reset.
