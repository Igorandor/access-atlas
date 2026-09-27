# Cancellation of disconnected individual reads

Verified September 27, 2026.

A controlled local test confirmed that closing a client's HTTP connection previously left its individual native GET running. The upstream request kept its concurrency slot until completion or the existing deadline. This was wasted work after losing the receiver, not a demonstrated bypass of the response-size or time limits.

The `/api/iris` route now attaches cancellation to premature response closure only for native GET operations. The transport combines that signal with its existing 20-second deadline. An already-cancelled read never invokes the sender. The response listener is removed when the operation settles, and normal completed responses do not cancel their read. Transport concurrency slots continue to be released in the existing `finally` block. A cancelled caller does not create a misleading native-failure activity entry or attempt to send a response to the closed connection.

The change does not apply to shared access snapshots, campaign collection, audit POST, reviewed writes or their readback. Those workflows have separate ownership or completion requirements. Disconnecting a read of an async job result also does not cancel the native job itself. Aborting an HTTP read stops the gateway's fetch; it does not promise immediate termination of work already started inside IRIS.

Existing bounds remain: native response bytes are counted before concatenation and JSON parsing (8,000,000 bytes); parsed JSON complexity is limited to 64 levels and 200,000 nodes. Individual native fetches have a 20-second deadline, with eight slots per authorization and sixteen overall. The native log extension reads at most 1 MiB before splitting lines and returns at most 500 lines. Snapshot collection stops starting new details after 45 seconds, with at most six detail reads in flight; those reads may finish later. The snapshot budget is not an atomic or hard 45-second deadline.

Five regressions use the real router/transport with a local HTTP client and synthetic native sender: disconnection, normal completion, a pre-cancelled signal, preservation of the existing deadline, and audit POST exclusion. Listener removal is checked for both successful and disconnected reads. `npm run check` passes TypeScript, production frontend/server builds and **182 tests**. No IRIS connection, trickling stream, load probe or Docker operation was used.
