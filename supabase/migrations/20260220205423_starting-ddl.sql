create table user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade not null,
  username text unique not null
  CONSTRAINT proper_username CHECK (username ~* '^[a-zA-Z0-9_]+$')
  CONSTRAINT username_length CHECK (char_length(username) > 3 and char_length(username) < 15)
);

alter table user_profiles enable row level security;

-- 1. Everyone (logged in or not) can see who a user is
CREATE POLICY "all can see/Profiles are public" ON "public"."user_profiles"
AS PERMISSIVE FOR SELECT
TO public
USING (true);

-- 2. Only LOGGED IN users can create their own profile
CREATE POLICY "users can insert/Users can create their own profile" ON "public"."user_profiles"
AS PERMISSIVE FOR INSERT
-- TO public
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

-- 3. Only the OWNER can change their username/settings
CREATE POLICY "owners can update/Users can update their own profile" ON "public"."user_profiles"
AS PERMISSIVE FOR UPDATE
-- TO public
TO authenticated
USING ((select auth.uid())=user_id)
WITH CHECK ((select auth.uid())=user_id);