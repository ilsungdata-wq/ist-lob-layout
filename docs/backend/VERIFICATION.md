# Backend verification plan

Run against a disposable Supabase branch/project. Create four Auth users: admin, viewer, editor and manager. Promote admin with trusted SQL, create a model through `create_model`, and assign the other permissions through `set_model_permission`.

## Required cases

| Case | Expected result |
|---|---|
| Authenticated user without permission selects model | Zero rows |
| VIEW lists model/version/layout | Rows returned |
| VIEW calls save/create/publish/permission RPC | `42501` denied |
| EDIT saves a DRAFT with current revision | Success; revision increments once; audit row added |
| EDIT saves a PUBLISHED version | `55000` immutable error |
| EDIT creates 0.4 from 0.3 | New DRAFT copies JSON; 0.3 hash/revision unchanged |
| Two EDIT sessions save revision 12 | First becomes 13; second receives `40001 revision_conflict` |
| MANAGE publishes DRAFT/REVIEW | Version published, model pointer changed, audit written |
| Unauthorized user changes permissions directly/RPC | Denied |
| Historical version reload | Exact JSON equality/hash with the saved snapshot |
| EDIT uploads under permitted model folder | Success |
| VIEW uploads or EDIT deletes shared asset | Denied |

Also verify logout/login, token refresh, version switching, two browsers, Storage signed URLs and that direct REST updates to protected tables fail even when manually crafted.
