# The Park Day Companion database

Migrations ready to run. **Actually tested against PostgreSQL 16 with pgvector** — not just written.

## Run order

```bash
psql -v ON_ERROR_STOP=1 -f migrations/001_extensions_and_taxonomy.sql
psql -v ON_ERROR_STOP=1 -f migrations/002_content.sql
psql -v ON_ERROR_STOP=1 -f migrations/003_knowledge.sql
psql -v ON_ERROR_STOP=1 -f migrations/004_users_trips.sql
psql -v ON_ERROR_STOP=1 -f migrations/005_conversations.sql
psql -v ON_ERROR_STOP=1 -f migrations/006_rls.sql
psql -v ON_ERROR_STOP=1 -f seed/010_reference.sql      # idempotent
```

On Supabase: copy into the `supabase/migrations/` folder and run `supabase db push`. `auth.users` and `auth.uid()` already exist there.

## What is here

| File | Contents |
|---|---|
| 001 | Extensions (pgvector, pg_trgm, pgcrypto) + shared domains |
| 002 | The content layer: destination → resort → park → land → experience + editorial/media/sources |
| 003 | The unstructured knowledge store + `verification_queue` |
| 004 | profile, profile_fact, trip, trip_day, plan_item |
| 005 | conversation, message + `unanswered_questions` |
| 006 | Row Level Security for all tables |
| seed/010 | Destination, 2 resorts, 7 parks |

## Five design decisions worth knowing before you touch anything

**1. Columns for what we filter on, JSONB for what we only display.**
Every field `search_experiences` filters on is a real column with an index. Filtering on JSONB works but does not get a good index — and exactly these fields (intensity, height, sensitivities) are what creates the product's value.

**2. `sens_*` are separate from `intensity`.**
A ride can be `intensity = 1` and still be unbearable — a simulator is nauseating even without speed. The test query proves it: filter for someone sensitive to motion sickness, and the intensity-1 ride is excluded while the intensity-4 roller coaster passes. Safety fields ⇒ T1 only.

**3. `profile_fact` is a row per fact, not a column per field.**
Every fact carries `source` (`stated` is never overwritten by `inferred`), `confidence`, and `updated_at`. Scope is expressed **structurally**: empty `trip_id` = a fact about the person, filled `trip_id` = a fact about this trip. Without this separation the next trip inherits the dates of the previous one. The table is small and bounded, so it is loaded in full on every turn — **there is no semantic retrieval of facts about the user here.**

**4. `plan_item.trip_day_id` is nullable, and `trip_day.park_ids` is an array.**
The first creates the wishlist and separates "what interests me" from "when I will do it". The second allows park-hopper. `plan_item` never copies a fact from `experience` — everything is read through the key, except an explicit `overrides`.

**5. No ANN index on `knowledge_chunk`, on purpose.**
Below 10,000 rows an exact scan is faster than HNSW and also loses no recall. Add one only under the conditions in appendix 6a of the retrieval document. `embedding_model` is a required column — **never mix models in the same index**: a query encoded with one model against documents encoded with another returns noise without any error to warn you.

## What is **not** here, and why

**Lands and rides were not seeded.** That is content, and the working rule in the project is that content comes from Neta and is verified against the official sources. Seeding a ride list from the general knowledge of a language model would put into the database exactly the kind of unverified information the product exists to solve — and without `source_url` and without `last_verified`, no one would be able to track it down later.

The parks were seeded, because the resort structure is a stable fact, not changing content.

## How content gets in

The template is outdated. **No Excel is needed** — the flow is:

1. **The admin form** (screen 14 in the screen inventory) writes directly to `experience` and the related tables. This is the main path.
2. **`apps/server/content/knowledge/*.md`** with frontmatter → `scripts/ingest.ts` → `knowledge_doc` + `knowledge_chunk`. Idempotent by `id`.
3. Every new record enters with `last_verified = null`, and therefore appears immediately in `verification_queue` until someone approves it.

`park-day-companion-tim-content-intake-1.md` is the first input for both of these paths. Every line marked there `[לבדוק]` ("to check") enters as `review_status = 'pending_review'` and does not reach the index until approved.
