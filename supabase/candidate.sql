---------------------------------------------------------------------
-- EXTENSIONS
---------------------------------------------------------------------

-- ltree enables hierarchical tree paths used for comment threads
-- Example:
-- root.post.comment
-- It provides operators like <@ to query descendants efficiently
CREATE EXTENSION IF NOT EXISTS ltree;



---------------------------------------------------------------------
-- CUSTOM TYPES
---------------------------------------------------------------------

-- ENUM type for votes.
-- This prevents invalid values such as:
-- 'UP', 'like', 'yes', etc.
-- Only 'up' or 'down' are allowed.

CREATE TYPE vote_type_enum AS ENUM ('up', 'down');



---------------------------------------------------------------------
-- USER PROFILES TABLE
---------------------------------------------------------------------

CREATE TABLE user_profiles (

  -- user id from Supabase authentication
  user_id UUID PRIMARY KEY
  REFERENCES auth.users (id)
  ON DELETE CASCADE
  NOT NULL,

  -- public username
  username TEXT UNIQUE NOT NULL,

  -- enforce valid characters
  CONSTRAINT proper_username
  CHECK (username ~* '^[a-zA-Z0-9_]+$'),

  -- enforce length
  CONSTRAINT username_length
  CHECK (
      char_length(username) > 3
      AND char_length(username) < 15
  )
);



---------------------------------------------------------------------
-- POSTS TABLE
---------------------------------------------------------------------

CREATE TABLE posts (

    -- time-ordered UUID improves index locality
    id UUID PRIMARY KEY DEFAULT uuidv7() NOT NULL,

    -- author
    user_id UUID NOT NULL
    REFERENCES auth.users (id),

    -- creation timestamp
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

    -- hierarchical comment path
    path LTREE NOT NULL
);



---------------------------------------------------------------------
-- PERFORMANCE INDEXES (NEW)
---------------------------------------------------------------------

-- Index posts by creation date for feed queries
CREATE INDEX idx_posts_created_at
ON posts (created_at DESC);

-- Index posts by user for profile queries
CREATE INDEX idx_posts_user
ON posts (user_id);

-- GIST index required for efficient ltree path operations
-- This dramatically speeds up queries like:
-- path <@ 'root.post'
CREATE INDEX idx_posts_path_gist
ON posts
USING GIST (path);



---------------------------------------------------------------------
-- POST SCORE TABLE
---------------------------------------------------------------------

CREATE TABLE post_score (

    post_id UUID PRIMARY KEY
    REFERENCES posts (id),

    score INTEGER NOT NULL
);

-- Index used when sorting posts by score
CREATE INDEX idx_post_score_value
ON post_score (score DESC);



---------------------------------------------------------------------
-- POST CONTENT TABLE
---------------------------------------------------------------------

CREATE TABLE post_contents (

    id UUID PRIMARY KEY DEFAULT uuidv7() NOT NULL,

    user_id UUID NOT NULL
    REFERENCES auth.users (id),

    post_id UUID NOT NULL
    REFERENCES posts (id),

    title TEXT,

    content TEXT,

    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index to quickly retrieve content for posts
CREATE INDEX idx_post_contents_post_id
ON post_contents (post_id);



---------------------------------------------------------------------
-- POST VOTES TABLE
---------------------------------------------------------------------

CREATE TABLE post_votes (

    id UUID PRIMARY KEY DEFAULT uuidv7() NOT NULL,

    post_id UUID NOT NULL
    REFERENCES posts (id),

    user_id UUID NOT NULL
    REFERENCES auth.users (id),

    -- ENUM instead of TEXT prevents invalid values
    vote_type vote_type_enum NOT NULL,

    -- prevents duplicate votes
    UNIQUE (post_id, user_id)
);

-- Index used to aggregate vote totals faster
CREATE INDEX idx_post_votes_post
ON post_votes (post_id);



---------------------------------------------------------------------
-- TRIGGER FUNCTION: UPDATE POST SCORE
---------------------------------------------------------------------

CREATE FUNCTION update_post_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $update_post_score$
BEGIN

    UPDATE post_score
    SET score = (
        SELECT SUM(
            CASE
                WHEN vote_type = 'up' THEN 1
                ELSE -1
            END
        )
        FROM post_votes
        WHERE post_id = NEW.post_id
    )
    WHERE post_id = NEW.post_id;

    RETURN NEW;

END;
$update_post_score$;



---------------------------------------------------------------------
-- TRIGGER: UPDATE SCORE WHEN VOTES CHANGE
---------------------------------------------------------------------

CREATE TRIGGER update_post_score
AFTER INSERT OR UPDATE
ON post_votes
FOR EACH ROW
EXECUTE FUNCTION update_post_score();



---------------------------------------------------------------------
-- FUNCTION: GET POSTS (PAGINATED)
---------------------------------------------------------------------

CREATE FUNCTION get_posts(page_number INT)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    created_at TIMESTAMPTZ,
    title TEXT,
    score INT,
    username TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN

    RETURN QUERY
    SELECT
        posts.id,
        posts.user_id,
        posts.created_at,
        post_contents.title,
        post_score.score,
        user_profiles.username

    FROM posts

    JOIN post_contents
      ON posts.id = post_contents.post_id

    JOIN post_score
      ON posts.id = post_score.post_id

    JOIN user_profiles
      ON posts.user_id = user_profiles.user_id

    WHERE posts.path ~ 'root'

    ORDER BY post_score.score DESC,
             posts.created_at DESC

    LIMIT 10
    OFFSET (page_number - 1) * 10;

END;
$$;



---------------------------------------------------------------------
-- FUNCTION: CREATE NEW POST
---------------------------------------------------------------------

CREATE FUNCTION create_new_post(userId UUID, title TEXT, content TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN

  WITH inserted_post AS (
      INSERT INTO posts (user_id, path)
      VALUES ($1, 'root')
      RETURNING id
  )

  INSERT INTO post_contents (post_id, title, content, user_id)
  VALUES (
      (SELECT id FROM inserted_post),
      $2,
      $3,
      $1
  );

  RETURN TRUE;

END;
$$;



---------------------------------------------------------------------
-- INITIALIZE POST SCORE
---------------------------------------------------------------------

CREATE FUNCTION initialize_post_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $initialize_post_score$
BEGIN

    INSERT INTO post_score (post_id, score)
    VALUES (NEW.id, 0);

    RETURN NEW;

END;
$initialize_post_score$;



CREATE TRIGGER initialize_post_score
AFTER INSERT
ON posts
FOR EACH ROW
EXECUTE FUNCTION initialize_post_score();



---------------------------------------------------------------------
-- COMMENT RETRIEVAL
---------------------------------------------------------------------

CREATE FUNCTION get_single_post_with_comments(post_id UUID)
RETURNS TABLE (
    id UUID,
    author_name TEXT,
    created_at TIMESTAMPTZ,
    title TEXT,
    content TEXT,
    score INT,
    path LTREE
)
LANGUAGE plpgsql
AS $$
BEGIN

    RETURN QUERY
    SELECT
      posts.id,
      user_profiles.username,
      posts.created_at,
      post_contents.title,
      post_contents.content,
      post_score.score,
      posts.path

    FROM posts

    JOIN post_contents
      ON posts.id = post_contents.post_id

    JOIN post_score
      ON posts.id = post_score.post_id

    JOIN user_profiles
      ON posts.user_id = user_profiles.user_id

    WHERE
      posts.path <@
      text2ltree(
          CONCAT('root.',
          REPLACE(CONCAT($1,''),'-','_'))
      )
    OR posts.id = $1;

END;
$$;



---------------------------------------------------------------------
-- CREATE COMMENT
---------------------------------------------------------------------

CREATE FUNCTION create_new_comment(
    user_id UUID,
    content TEXT,
    path LTREE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN

  WITH inserted_post AS (
      INSERT INTO posts (user_id, path)
      VALUES ($1, $3)
      RETURNING id
  )

  INSERT INTO post_contents (post_id, title, content, user_id)
  VALUES (
      (SELECT id FROM inserted_post),
      '',
      $2,
      $1
  );

  RETURN TRUE;

END;
$$;



---------------------------------------------------------------------
-- ENABLE ROW LEVEL SECURITY
---------------------------------------------------------------------

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_score ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_votes ENABLE ROW LEVEL SECURITY;



---------------------------------------------------------------------
-- POLICIES
---------------------------------------------------------------------

CREATE POLICY "all can see"
ON post_contents
FOR SELECT
TO public
USING (true);

CREATE POLICY "authors can create"
ON post_contents
FOR INSERT
TO public
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "all can see"
ON post_score
FOR SELECT
TO public
USING (true);

CREATE POLICY "all can see"
ON post_votes
FOR SELECT
TO public
USING (true);

CREATE POLICY "owners can insert"
ON post_votes
FOR INSERT
TO public
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owners can update"
ON post_votes
FOR UPDATE
TO public
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "all can see"
ON posts
FOR SELECT
TO public
USING (true);

CREATE POLICY "owners can insert"
ON posts
FOR INSERT
TO public
WITH CHECK (auth.uid() = user_id);



---------------------------------------------------------------------
-- PROFILE POLICIES
---------------------------------------------------------------------

CREATE POLICY "profiles public"
ON user_profiles
FOR SELECT
TO public
USING (true);

CREATE POLICY "users create profile"
ON user_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update profile"
ON user_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);



---------------------------------------------------------------------
-- REALTIME PUBLICATION
---------------------------------------------------------------------

BEGIN;

DROP PUBLICATION IF EXISTS supabase_realtime CASCADE;

CREATE PUBLICATION supabase_realtime
WITH (publish = 'insert, update, delete');

ALTER PUBLICATION supabase_realtime
ADD TABLE post_score;

COMMIT;