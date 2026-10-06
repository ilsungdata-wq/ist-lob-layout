# Supabase infrastructure

Apply migrations with the Supabase CLI from the repository root:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

For a project managed through SQL Editor, run the migration files once in filename order. The current workflow migration is `migrations/202610060003_permissions_revisions_management.sql`. It is additive: it preserves Models, Versions, Published snapshots, users, and existing permissions. After it completes, run `verify_permissions_revisions.sql` and `verify_anonymous_published_view.sql`; both verification files are read-only.

The only values needed by the static frontend are the project URL and publishable key. Copy `supabase-config.example.js` to ignored `supabase-config.js` and fill those safe public values when integration testing begins.

After the first user signs up, promote exactly the intended administrator through a trusted SQL session:

```sql
update public.profiles
set global_role = 'ADMIN'
where email = 'approved-admin@company.example';
```

Do not place database credentials or the service-role key in this repository or GitHub Pages.

The optional `seed.sql` is not a migration and is never applied by `supabase db push` automatically.
