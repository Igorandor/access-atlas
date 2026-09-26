# Independent implementation and provenance

Access Atlas is an access-review project: graph analysis, local role-removal previews, a resource matrix, review notes and snapshot comparison.

An earlier revision reused Harbor's custom administration foundation. It was not an organizer-provided application template. On September 26, 2026 that production foundation was removed: the generic Collection, Editor, StructuredField, Overview, System, Logs and Explorer screens and their presentation model no longer exist in this checkout.

Atlas now has its own configuration register and field-level proposal desk in `src/desk`, an independent bounded transport in `server/atlas-transport.ts`, session vault in `server/atlas-sessions.ts`, application router, response views, typed proposal form, schema/redaction helpers and native extension implementation. Its original access analysis, collector, import schema and review UI remain the central domain.

No Harbor or Relay file, local package, checkout, service or volume is required to build or run Atlas. This is a separate Git repository, npm project, image, Compose stack and native namespace.

## What still has common provenance

The official InterSystems API reference and its generated request projection are reference material, not an application template. Third-party packages and conventional React/Vite/TypeScript/container bootstrap configuration necessarily follow common conventions. Security regression contracts and native integration probes from the earlier foundation remain intentionally: they verify that replacement code preserves previously tested guarantees. The small `shared/catalog.ts` adapter exists for those probes; the application uses `shared/register.ts`.

The Harbor copyright notice remains for retained test/support material and historical revisions. Git history is intact and shows the earlier implementation. Exact-file checks find no identical production TypeScript files across the three projects; this is a regression check, not a numerical originality score or organizer approval.
