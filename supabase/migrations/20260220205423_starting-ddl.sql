---------------------------------------------------------------------
-- EXTENSIONS
---------------------------------------------------------------------

-- ltree provides a specialized tree-path data type used for
-- representing hierarchical relationships (such as nested comments).
-- Example stored value:
--   root.post.comment
-- It allows fast traversal queries using operators like <@ and @>.
CREATE EXTENSION IF NOT EXISTS ltree;



---------------------------------------------------------------------
-- USER PROFILES TABLE
---------------------------------------------------------------------

-- Stores public user profile information separate from auth.users.
-- auth.users is managed by Supabase authentication.
-- This table adds application-specific profile data.

CREATE TABLE user_profiles (

  -- Primary key matches the authenticated user's id
  -- The id originates from auth.users.
  user_id UUID PRIMARY KEY

  -- Foreign key ensures profile belongs to a valid auth user.
  REFERENCES auth.users (id)
  ON DELETE CASCADE

  -- NOT NULL prevents orphan profiles
  NOT NULL,

  -- Username chosen by the user
  username TEXT UNIQUE NOT NULL,

  -- Ensures usernames only contain letters, numbers, or underscores
  CONSTRAINT proper_username
  CHECK (username ~* '^[a-zA-Z0-9_]+$'),

  -- Enforces username length constraints
  CONSTRAINT username_length
  CHECK (
      char_length(username) > 3
      AND char_length(username) < 15
  )
);



---------------------------------------------------------------------
-- POSTS TABLE
---------------------------------------------------------------------

-- This table stores the structural data for posts AND comments.
-- Comments are represented as posts with a deeper ltree path.

CREATE TABLE posts (

    -- Unique identifier for each post
    -- Uses PostgreSQL 18 native uuidv7()
    -- uuidv7 is time-ordered which improves index performance.
    id UUID PRIMARY KEY DEFAULT uuidv7() NOT NULL,

    -- Author of the post
    user_id UUID NOT NULL
    REFERENCES auth.users (id),

    -- Timestamp of creation
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

    -- Hierarchical path of the post within the comment tree
    -- Example values:
    -- root
    -- root.post
    -- root.post.comment
    path LTREE NOT NULL
);



---------------------------------------------------------------------
-- POST SCORE TABLE
---------------------------------------------------------------------

-- Stores the computed score of a post.
-- Score is derived from votes but cached here for faster sorting.

CREATE TABLE post_score (

    -- Each post has exactly one score row
    post_id UUID PRIMARY KEY
    REFERENCES posts (id),

    -- Current score value (sum of votes)
    score INTEGER NOT NULL
);



---------------------------------------------------------------------
-- POST CONTENT TABLE
---------------------------------------------------------------------

-- Separates content data from structural post data.
-- This pattern makes it easier to support edits, versions, or metadata.

CREATE TABLE post_contents (

    -- Unique content identifier
    id UUID PRIMARY KEY DEFAULT uuidv7() NOT NULL,

    -- Author of the content
    user_id UUID NOT NULL
    REFERENCES auth.users (id),

    -- Associated post
    post_id UUID NOT NULL
    REFERENCES posts (id),

    -- Post title (may be null for comments)
    title TEXT,

    -- Main post body text
    content TEXT,

    -- Creation timestamp
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);



---------------------------------------------------------------------
-- POST VOTES TABLE
---------------------------------------------------------------------

-- Tracks user voting activity on posts.

CREATE TABLE post_votes (

    -- Unique vote identifier
    id UUID PRIMARY KEY DEFAULT uuidv7() NOT NULL,

    -- Post being voted on
    post_id UUID NOT NULL
    REFERENCES posts (id),

    -- User casting the vote
    user_id UUID NOT NULL
    REFERENCES auth.users (id),

    -- Vote type (expected values: 'up' or 'down')
    vote_type TEXT NOT NULL,

    -- Prevents users from voting multiple times on the same post
    UNIQUE (post_id, user_id)
);



---------------------------------------------------------------------
-- TRIGGER FUNCTION: UPDATE POST SCORE
---------------------------------------------------------------------

-- This function recalculates the score of a post whenever
-- a vote is inserted or updated.

CREATE FUNCTION update_post_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $update_post_score$
BEGIN

    -- Recalculate score by summing all votes for the post
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
-- TRIGGER: RUN SCORE UPDATE AFTER VOTE CHANGES
---------------------------------------------------------------------

CREATE TRIGGER update_post_score
AFTER INSERT OR UPDATE
ON post_votes
FOR EACH ROW
EXECUTE FUNCTION update_post_score();



---------------------------------------------------------------------
-- FUNCTION: GET POSTS (PAGINATED)
---------------------------------------------------------------------

-- Returns posts sorted by score and creation time.

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

    -- Only root-level posts (not comments)
    WHERE posts.path ~ 'root'

    -- Sort by popularity then recency
    ORDER BY post_score.score DESC,
             posts.created_at DESC

    -- Pagination limit
    LIMIT 10

    -- Offset based on page number
    OFFSET (page_number - 1) * 10;

END;
$$;



---------------------------------------------------------------------
-- FUNCTION: CREATE NEW POST
---------------------------------------------------------------------

-- Inserts a new root-level post.

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
-- TRIGGER FUNCTION: INITIALIZE POST SCORE
---------------------------------------------------------------------

-- Ensures every post has a score row immediately after creation.

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



---------------------------------------------------------------------
-- TRIGGER: RUN SCORE INITIALIZATION
---------------------------------------------------------------------

CREATE TRIGGER initialize_post_score
AFTER INSERT
ON posts
FOR EACH ROW
EXECUTE FUNCTION initialize_post_score();



---------------------------------------------------------------------
-- FUNCTION: GET SINGLE POST WITH COMMENTS
---------------------------------------------------------------------

-- Returns a post and all of its comments using ltree traversal.

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
      posts.path <@ text2ltree(
          CONCAT('root.',
          REPLACE(CONCAT($1, ''), '-', '_'))
      )

    OR posts.id = $1;

END;
$$;



---------------------------------------------------------------------
-- FUNCTION: CREATE NEW COMMENT
---------------------------------------------------------------------

-- Creates a comment by inserting a post with a deeper ltree path.

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

  INSERT INTO post_contents (
      post_id,
      title,
      content,
      user_id
  )
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
-- RLS POLICIES
---------------------------------------------------------------------

-- Anyone can read post contents
CREATE POLICY "all can see"
ON post_contents
FOR SELECT
TO public
USING (true);


-- Only authors can insert their own content
CREATE POLICY "authors can create"
ON post_contents
FOR INSERT
TO public
WITH CHECK (auth.uid() = user_id);



-- Anyone can read post scores
CREATE POLICY "all can see"
ON post_score
FOR SELECT
TO public
USING (true);



-- Anyone can read votes
CREATE POLICY "all can see"
ON post_votes
FOR SELECT
TO public
USING (true);



-- Users can vote on posts themselves
CREATE POLICY "owners can insert"
ON post_votes
FOR INSERT
TO public
WITH CHECK (auth.uid() = user_id);



-- Users can update their vote
CREATE POLICY "owners can update"
ON post_votes
FOR UPDATE
TO public
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);



-- Posts are publicly readable
CREATE POLICY "all can see"
ON posts
FOR SELECT
TO public
USING (true);



-- Users can only create their own posts
CREATE POLICY "owners can insert"
ON posts
FOR INSERT
TO public
WITH CHECK (auth.uid() = user_id);



---------------------------------------------------------------------
-- PROFILE POLICIES
---------------------------------------------------------------------

-- Profiles are public
CREATE POLICY "profiles public"
ON user_profiles
FOR SELECT
TO public
USING (true);



-- Authenticated users can create their profile
CREATE POLICY "users create profile"
ON user_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);



-- Users can update their own profile
CREATE POLICY "users update profile"
ON user_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);



---------------------------------------------------------------------
-- REALTIME PUBLICATION (SUPABASE)
---------------------------------------------------------------------

BEGIN;

DROP PUBLICATION IF EXISTS supabase_realtime CASCADE;

CREATE PUBLICATION supabase_realtime
WITH (publish = 'insert, update, delete');

ALTER PUBLICATION supabase_realtime
ADD TABLE post_score;

COMMIT;