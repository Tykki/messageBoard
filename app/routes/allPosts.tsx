import {
  Link,
  useLoaderData,
  useRevalidator,
  useFetcher,
} from "react-router";
import { getSupaServer } from "../lib/supaServer";
import type { Route } from "../routes/+types/allPosts";
import { CreatePost } from "../createPost";
import { timeAgo } from "../timeAgo";
import { UpVote } from "../upVote";

export interface PostWithMeta {
  id: string;
  title: string;
  content: string;
  score: number;
  created_at: string;
  username: string;
  path: string;
}

/**
 * =========================================================
 * LOADER (Fetch Posts + Votes)
 * =========================================================
 * Replaces:
 * - supaClient.rpc("get_posts")
 * - client-side vote fetching
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { supaServer } = getSupaServer(request);

  const pageNumber = params.pageNumber ? Number(params.pageNumber) : 1;

  // Get authenticated user
  const {
    data: { user },
  } = await supaServer.auth.getUser();

  // Fetch posts
  const { data: posts, error } = await supaServer.rpc("get_posts", {
    page_number: pageNumber,
  });

  if (error) {
    console.error(error);
    throw new Response("Failed to load posts", { status: 500 });
  }

  /**
   * Fetch user's votes (if logged in)
   */
  let myVotes: Record<string, "up" | "down"> = {};

  if (user) {
    const { data: votesData } = await supaServer
      .from("post_votes")
      .select("*")
      .eq("user_id", user.id);

    if (votesData) {
      myVotes = votesData.reduce((acc, vote) => {
        acc[vote.post_id] = vote.vote_type;
        return acc;
      }, {} as Record<string, "up" | "down">);
    }
  }

  return { posts, user, myVotes };
}

/**
 * =========================================================
 * ACTION (Handle Voting)
 * =========================================================
 * Replaces your old castVote utility
 */
export async function action({ request }: Route.ActionArgs) {
  const { supaServer } = getSupaServer(request);
  const formData = await request.formData();

  const postId = formData.get("postId");
  const voteType = formData.get("voteType");

  if (typeof postId !== "string" || typeof voteType !== "string") {
    return { error: "Invalid vote request." };
  }

  const {
    data: { user },
  } = await supaServer.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to vote." };
  }

  const { error } = await supaServer.rpc("cast_vote", {
    post_id: postId,
    user_id: user.id,
    vote_type: voteType,
  });

  if (error) {
    console.error(error);
    return { error: "Vote failed." };
  }

  return { success: true };
}

/**
 * =========================================================
 * MAIN COMPONENT
 * =========================================================
 */
export default function AllPosts() {
  const { posts, user, myVotes } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  return (
    <>
      {/* Create Post */}
      {user && (
        <CreatePost
          newPostCreated={() => {
            revalidator.revalidate();
          }}
        />
      )}

      {/* Posts List */}
      <div className="posts-container">
        {posts.map((post: any) => (
          <Post
            key={post.id}
            postData={post}
            myVote={myVotes?.[post.id]}
            onVoteSuccess={() => {
              revalidator.revalidate();
            }}
          />
        ))}
      </div>
    </>
  );
}

/**
 * =========================================================
 * POST COMPONENT
 * =========================================================
 */
function Post({
  postData,
  myVote,
}: {
  postData: any;
  myVote: "up" | "down" | undefined;
}) {
  const fetcher = useFetcher();

  const isVoting = fetcher.state !== "idle";

  return (
    <div className="post-container">
      <div className="post-upvote-container">
        {/* UPVOTE */}
        <fetcher.Form method="post">
          <input type="hidden" name="postId" value={postData.id} />
          <input type="hidden" name="voteType" value="up" />
          <UpVote
            direction="up"
            filled={myVote === "up"}
            enabled={!isVoting}
          />
        </fetcher.Form>

        <p className="text-center">{postData.score}</p>

        {/* DOWNVOTE */}
        <fetcher.Form method="post">
          <input type="hidden" name="postId" value={postData.id} />
          <input type="hidden" name="voteType" value="down" />
          <UpVote
            direction="down"
            filled={myVote === "down"}
            enabled={!isVoting}
          />
        </fetcher.Form>
      </div>

      <Link to={`/post/${postData.id}`} className="flex-auto">
        <p className="mt-4">
          Posted By {postData.username}{" "}
          {timeAgo(postData.created_at)} ago
        </p>
        <h3 className="text-2xl">{postData.title}</h3>
      </Link>
    </div>
  );
}