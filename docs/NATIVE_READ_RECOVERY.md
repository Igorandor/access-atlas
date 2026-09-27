# Native read hook scope and recovery

Verified September 27, 2026.

The native read hook serves ConfigurationDesk scope and inventory lists. Its previous implementation returned the earlier query's data and timestamp during the first render after a query changed; only the subsequent effect cleared them. Wallet collection and OAuth issuer selectors change that query on the same mounted register. It also cleared a successful result before every manual reload, including reloads that subsequently failed with 500.

Hook state now identifies its path and query. A mismatched key returns an empty loading state immediately, before effects run. An empty path clears data, timestamp and error without starting a request. Reloading the same key preserves its last successful evidence and collection time through a temporary error; a 403 removes both. Old effect completions remain ignored. A refused inventory list does not itself erase a separately selected record or proposal.

Four actual-hook regressions exercise render and effect phases, same-query 500/403 recovery, changed path/query, obsolete completions, disabled paths and the optional polling branch. Current consumers do not enable polling: its previous 403 behavior was a dormant hook problem, not a demonstrated live UI disclosure. Tests use deterministic hooks and responses, not a mounted browser. Browser integration inspects the production ConfigurationDesk separately using synthetic wallet collections A/B and controlled list responses.

`npm run check` passes TypeScript, frontend/server production builds and **177 tests**. No native mutations, Docker changes or new dependencies were needed.

Integration browser check (September 27, 2026): production Configuration register with synthetic wallet scopes preserved Metadata-A after same-source 500. Switching to B with a failing read showed no A records. A later successful B read showed Metadata-B, and B403 removed it. Desktop 1280×900 and phone 390×844 passed (phone document/scroll width 375/375). No selected record or proposal was opened, no native calls or writes were made, and this does not claim polling is active in the application.
