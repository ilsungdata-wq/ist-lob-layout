# Legacy data migration strategy

1. Freeze no production data. Export localStorage and D1 snapshots first.
2. Build an inventory keyed by normalized model code and version string. Hash each full layout JSON to expose duplicates and divergence.
3. Create authenticated users and profiles; map legacy editor emails to user UUIDs.
4. Create model rows and explicit VIEW/EDIT/MANAGE grants.
5. Insert each historical version with its exact layout document. Mark only explicitly approved history as `PUBLISHED`; import uncertain records as `DRAFT` or `ARCHIVED` after review.
6. Upload PNG/JPG/SVG/data-URL payloads to `factory-assets/{model_id}/...`; replace embedded binary data with asset references.
7. Preserve process/LOB/Jig data in an export package until their normalized tables are introduced. They may remain inside an import metadata envelope temporarily, but not be silently discarded.
8. Compare model count, version count, object count, T/T/MP totals and image count before and after migration.
9. Run save/reload/version switching with two users and force a revision conflict.
10. Enable Supabase as authoritative only after sign-off. Keep the legacy export read-only for rollback.

No migration in this phase deletes localStorage, D1 rows or current static data.
