# Project scope and shared foundation

Access Atlas is a standalone contest project built around access reviews: role-path analysis, local removal previews, a resource matrix, a review queue and snapshot comparison.

It shares an original MIT-licensed administration foundation with the sibling Harbor project: the native API catalog, safe gateway, collection editors, telemetry/log extension and general administration screens. This reuse is intentional and disclosed; the review domain is implemented separately in `shared/access-model.ts`, `server/access-snapshot.ts` and `src/features/access`.

There is no dependency on a Harbor checkout, server or deployment. The repository contains its own build, installer, Docker stack, tests and documentation. Its native extension uses the separate `Atlas` package and `/api/atlas` application. The three proposed contest entries should be described by their distinct workflows, with this common foundation acknowledged rather than presented as unrelated implementations.
