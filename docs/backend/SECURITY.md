# Security and operations

## Safe configuration

The browser may receive only the project URL and Supabase publishable/anon key. These values identify the project but do not bypass RLS. Never commit a service-role key, database password, JWT signing secret or direct database connection string.

This repository has no bundler. Copy `supabase-config.example.js` to ignored `supabase-config.js`, fill the two frontend-safe values, and load it before modules that use the service. A CI workflow may generate the same file from `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` repository variables/secrets.

## Applying migrations

Preferred Supabase CLI flow after linking the project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

`supabase login` and `link` keep credentials outside frontend source. As an alternative, paste the version-controlled migration into the Supabase SQL editor once. Do not create tables manually one-by-one.

## Backups and exports

- Use Supabase scheduled backups/PITR according to the project plan.
- Administrative logical export: `supabase db dump --linked --data-only` or `pg_dump` from a protected operator environment.
- Export Storage objects separately; database dumps contain paths/metadata, not object bytes.
- Test restoration in a separate Supabase project before relying on it.

## Operational notes

- Deactivate profiles rather than deleting users with production history.
- Audit rows are append-only to browser users.
- Published version content is immutable through available RPCs.
- Storage is private and signed URLs should be short-lived.
- Promote the first ADMIN through a trusted SQL/operator process, never through a browser form.
