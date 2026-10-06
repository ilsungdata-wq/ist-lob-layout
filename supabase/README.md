# Supabase infrastructure

Apply migrations with the Supabase CLI from the repository root:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The only values needed by the static frontend are the project URL and publishable key. Copy `supabase-config.example.js` to ignored `supabase-config.js` and fill those safe public values when integration testing begins.

After the first user signs up, promote exactly the intended administrator through a trusted SQL session:

```sql
update public.profiles
set global_role = 'ADMIN'
where email = 'approved-admin@company.example';
```

Do not place database credentials or the service-role key in this repository or GitHub Pages.

The optional `seed.sql` is not a migration and is never applied by `supabase db push` automatically.
