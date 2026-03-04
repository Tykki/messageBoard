/* ============================================================
   EXTENSIONS (Modern PostgreSQL Setup)
   ============================================================ */

/*
  pgcrypto provides gen_random_uuid().

  Modern PostgreSQL (13+) recommends using this
  instead of uuid-ossp.

  Why?
  - uuid-ossp is older and largely legacy.
  - gen_random_uuid() is cryptographically secure.
  - Simpler dependency footprint.
  - Preferred by PostgreSQL maintainers.
*/
create extension if not exists pgcrypto;


/* ============================================================
   USER PROFILES
   ============================================================ */

/*
  user_profiles extends Supabase's auth.users table.

  We NEVER modify auth.users directly.
  Instead, we create a 1:1 table in public schema
  for application-specific profile data.
*/

create table user_profiles (

  /*
    user_id:
    - Primary key
    - Foreign key to auth.users
    - Enforces 1:1 relationship

    on delete cascade:
    If the auth user is deleted,
    the profile is automatically deleted.
  */
  user_id uuid primary key
    references auth.users (id)
    on delete cascade
    not null,

  /*
    username:
    - Public identifier
    - Must be unique
    - Required
  */
  username text not null unique,

  /*
    Regex enforces only:
    letters, numbers, underscore.
  */
  constraint proper_username
    check (username ~ '^[a-zA-Z0-9_]+$'),

  /*
    Length must be between 3–15 inclusive.
    BETWEEN is clearer than > and < checks.
  */
  constraint username_length
    check (char_length(username) between 3 and 15)
);

/*
  UNIQUE already creates an index,
  but explicit index naming improves clarity
  when reading execution plans.
*/
create index idx_user_profiles_username
  on user_profiles(username);



/* ============================================================
   POSTS (ROOT POSTS + COMMENTS)
   ============================================================ */

/*
  This table stores BOTH:
  - Top-level posts
  - Comments

  We differentiate using the ltree path.
*/

create table posts (

  /*
    Modern UUID generation.
    gen_random_uuid() comes from pgcrypto.
  */
  id uuid primary key
    default gen_random_uuid(),

  /*
    Owner of post/comment.
    If user is deleted → cascade removes posts.
  */
  user_id uuid not null
    references auth.users (id)
    on delete cascade,

  /*
    timestamptz always preferred.
    Avoid plain timestamp in distributed systems.
  */
  created_at timestamptz not null
    default now(),

  /*
    ltree path example:

      root
      root.abcd1234
      root.abcd1234.efgh5678

    Enables Reddit-style threaded comments
    without recursive CTEs.
  */
  path ltree not null
);

/*
  Required for fast hierarchical queries.
  GIST index supports ltree operators like <@.
*/
create index idx_posts_path
  on posts using gist(path);

/*
  Helps sorting by newest.
*/
create index idx_posts_created_at
  on posts(created_at desc);



/* ============================================================
   POST CONTENT
   ============================================================ */

/*
  Content separated from posts for scalability.

  Why separate?
  - Enables version history in future
  - Allows content moderation systems
  - Cleaner separation of structural vs text data
*/

create table post_contents (

  id uuid primary key
    default gen_random_uuid(),

  post_id uuid not null
    references posts (id)
    on delete cascade,

  /*
    Stored redundantly for easier RLS.
    Avoids complex joins in policy checks.
  */
  user_id uuid not null
    references auth.users (id)
    on delete cascade,

  title text,
  content text,

  created_at timestamptz not null
    default now()
);

create index idx_post_contents_post_id
  on post_contents(post_id);



/* ============================================================
   POST SCORE (DENORMALIZED AGGREGATE)
   ============================================================ */

/*
  This stores computed vote totals.

  Why not compute on read?
  Because:
  - SUM() across millions of votes is slow.
  - Sorting by score would require aggregation each time.
  - Denormalization is common in ranking systems.
*/

create table post_score (

  post_id uuid primary key
    references posts (id)
    on delete cascade,

  score integer not null default 0
);

create index idx_post_score_score
  on post_score(score desc);



/* ============================================================
   VOTES
   ============================================================ */

/*
  ENUM prevents invalid vote types.
  Better than text because:
  - Smaller storage
  - Safer constraints
  - Clearer intent
*/

create type vote_enum as enum ('up', 'down');

create table post_votes (

  id uuid primary key
    default gen_random_uuid(),

  post_id uuid not null
    references posts (id)
    on delete cascade,

  user_id uuid not null
    references auth.users (id)
    on delete cascade,

  vote_type vote_enum not null,

  /*
    Prevent duplicate voting.
  */
  unique (post_id, user_id)
);

create index idx_post_votes_post_id
  on post_votes(post_id);



/* ============================================================
   TRIGGER: INITIALIZE SCORE
   ============================================================ */

/*
  Automatically creates a score row
  whenever a post is inserted.

  This guarantees:
  Every post always has exactly one score row.
*/

create function initialize_post_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into post_score (post_id, score)
  values (new.id, 0);

  return new;
end;
$$;

create trigger trg_initialize_post_score
after insert on posts
for each row
execute procedure initialize_post_score();



/* ============================================================
   TRIGGER: UPDATE SCORE ON VOTE CHANGE
   ============================================================ */

/*
  Handles:
  - INSERT vote
  - UPDATE vote
  - DELETE vote

  coalesce(new, old) ensures
  we handle DELETE properly.
*/

create function update_post_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_post uuid;
begin
  affected_post := coalesce(new.post_id, old.post_id);

  update post_score
  set score = (
    select coalesce(
      sum(case when vote_type = 'up' then 1 else -1 end),
      0
    )
    from post_votes
    where post_id = affected_post
  )
  where post_id = affected_post;

  return coalesce(new, old);
end;
$$;

create trigger trg_update_post_score
after insert or update or delete
on post_votes
for each row
execute procedure update_post_score();



/* ============================================================
   ROW LEVEL SECURITY (SUPABASE MODEL)
   ============================================================ */

/*
  Supabase injects auth.uid()
  from the user's JWT.

  RLS ensures:
  Users can only modify their own rows.
*/

alter table user_profiles enable row level security;
alter table posts enable row level security;
alter table post_contents enable row level security;
alter table post_score enable row level security;
alter table post_votes enable row level security;


/* ---------- PUBLIC READ POLICIES ---------- */

create policy "public_read_profiles"
on user_profiles for select
using (true);

create policy "public_read_posts"
on posts for select
using (true);

create policy "public_read_contents"
on post_contents for select
using (true);

create policy "public_read_scores"
on post_score for select
using (true);

create policy "public_read_votes"
on post_votes for select
using (true);


/* ---------- OWNERSHIP POLICIES ---------- */

create policy "users_insert_own_profile"
on user_profiles for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users_update_own_profile"
on user_profiles for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users_insert_own_posts"
on posts for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users_insert_own_content"
on post_contents for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users_insert_own_votes"
on post_votes for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users_update_own_votes"
on post_votes for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);



/* ============================================================
   REALTIME
   ============================================================ */

/*
  We DO NOT drop Supabase’s publication.

  That can break other tables.

  Instead, we simply add post_score
  so live vote updates can stream to clients.
*/

alter publication supabase_realtime
add table post_score;