# Session replacement during sign-in

Before issuing a replacement session, Atlas now checks that the active session present when sign-in began is still the same and has not expired. A logout or another successful replacement during the identity lookup makes the pending login return 409 without setting or clearing a cookie. This prevents a late HTTP response from restoring authentication after an acknowledged logout or overwriting a newer login.

The browser's existing generation checks protect displayed data, but cannot undo a HttpOnly Set-Cookie response. The server therefore enforces this check after native identity validation and immediately before creating the new session, without an asynchronous gap. It does not extend the old session's idle deadline. A failed identity lookup preserves the old session. A cookie already missing or expired when login starts is allowed to establish a fresh session normally.

This check covers replacement of a shared active session. It does not claim to order unrelated anonymous logins that had no active session in common. It does not cancel operations authorized before logout or retry administrative writes.

## Verification — September 27, 2026

The original isolated API reproduction returned a usable new cookie after logout while identity verification was held. Five actual Express regression tests now cover logout, concurrent replacement, expiry during lookup, failed credentials preserving the old session, and successful sign-in with an initially stale/expired cookie. Rejected completion returns no Set-Cookie header; the newer session remains usable. Full check: 207 tests and both production builds pass. All identity responses are synthetic; no live IRIS or existing records are used. No UI behavior or layout changed.
