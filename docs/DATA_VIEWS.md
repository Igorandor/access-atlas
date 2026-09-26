# Atlas evidence and proposals

The access map, matrix, queue and baseline comparison are specialized review views. Native administration uses a register with an object index and a separate proposal area.

A register reads at most 250 rows by default. Search filters the loaded records; supported native filters can narrow the next request. Wallet and OAuth registers use explicit scopes. Selecting an object reads its native details. A proposal includes only checked fields; selected existing values are preserved, credentials are masked, and nested values have typed controls. Creation of tasks supplies all native default fields. Every write has a review step; deletion and execution controls require a typed identifier.

Evidence arrays use a table with at most eight discovered columns and 250 visible matching rows. Record inspection expands nested values on demand; each level displays at most 100 fields/items and the viewer stops at five levels. The export contains the loaded, redacted data, including records outside the visible table slice. It is not a full-instance backup.

The proposal editor supports up to eight nested levels and 200 array items. Additional schema fields are selected explicitly. Omitted fields are not sent. Native validation errors leave the proposal available for correction.

Instance evidence and logs are collected manually with source labels and capture timestamps. Session history is ephemeral. Logs, task history, journal files and asynchronous audit queries keep their native meanings. Host counters describe the OS visible to IRIS, not container resource quotas; cumulative CPU ticks are not labelled as utilization.

The API catalog executes read operations only. JSON is an export format, not a required configuration editor.
