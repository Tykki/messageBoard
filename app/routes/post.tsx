import {
  useLoaderData,
  useFetcher,
  useRevalidator,
} from "react-router";
import { getSupaServer } from "../lib/supaServer";
import type { Route } from "./routes/+types/post";
import { usePostScore } from "../usePostScore";
import { timeAgo } from "../timeAgo";
import { UpVote } from "../upVote";
import { useMemo, useState } from "react";

/**
 * =========================================================
 * TYPES
 * =========================================================
 */

export interface Comment {
  id: string;
  author_name: string;
  content: string;
  score: number;
  created_at: string;
  path: string;
  comments: Comment[];
}

/**
 * =========================================================
 * LOADER (Fetch Post + Comments + Votes)
 * =========================================================
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { supaServer } = getSupaServer(request);
  const postId = params.postId;

  if (!postId) {
    throw new Response("Post not found", { status: 404 });
  }

  const {
    data: { user },
  } = await supaServer.auth.getUser();

  // Fetch post + comments
  const { data, error } = await supaServer.rpc(
    "get_single_post_with_comments",
    { post_id: postId }
  );

  if (error || !data || data.length === 0) {
    throw new Response("Post not found", { status: 404 });
  }

  const post = data.find((x: any) => x.id === postId);
  const comments = data.filter((x: any) => x.id !== postId);

  /**
   * Fetch votes
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

  return { post, comments, myVotes, user };
}

/**
 * =========================================================
 * ACTION (Voting + Comment Creation)
 * =========================================================
 */
export async function action({ request }: Route.ActionArgs) {
  const { supaServer } = getSupaServer(request);
  const formData = await request.formData();

  const intent = formData.get("intent");

  const {
    data: { user },
  } = await supaServer.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  /**
   * ----------------------------------------
   * HANDLE VOTING
   * ----------------------------------------
   */
  if (intent === "vote") {
    const postId = formData.get("postId");
    const voteType = formData.get("voteType");

    if (typeof postId !== "string" || typeof voteType !== "string") {
      return { error: "Invalid vote." };
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
   * ----------------------------------------
   * HANDLE COMMENT CREATION
   * ----------------------------------------
   */
  if (intent === "comment") {
    const content = formData.get("content");
    const path = formData.get("path");

    if (typeof content !== "string" || typeof path !== "string") {
      return { error: "Invalid comment." };
    }

    const { error } = await supaServer.rpc("create_new_comment", {
      user_id: user.id,
      content,
      path,
    });

    if (error) {
      console.error(error);
      return { error: "Failed to create comment." };
    }

    return { success: true };
  }

  return { error: "Unknown action." };
}

/**
 * =========================================================
 * MAIN COMPONENT
 * =========================================================
 */
export default function PostView() {
  const { post, comments, myVotes, user } =
    useLoaderData<typeof loader>();

  const revalidator = useRevalidator();

  const nestedComments = useMemo(
    () => unsortedCommentsToNested(comments),
    [comments]
  );

  if (!post) return null;

  return (
    <div className="post-detail-outer-container">
      <div className="post-detail-inner-container">
        <PostHeader
          post={post}
          myVote={myVotes?.[post.id]}
          onAction={() => revalidator.revalidate()}
        />

        <div className="post-detail-body">
          <p>
            Posted By {post.author_name}{" "}
            {timeAgo(post.created_at)} ago
          </p>

          <h3 className="text-2xl">{post.title}</h3>

          <p className="post-detail-content">{post.content}</p>

          {user && (
            <CreateComment
              parent={post}
              onSuccess={() => revalidator.revalidate()}
            />
          )}

          {nestedComments.map((comment) => (
            <CommentView
              key={comment.id}
              comment={comment}
              myVotes={myVotes}
              onAction={() => revalidator.revalidate()}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * =========================================================
 * POST HEADER (Voting)
 * =========================================================
 */
function PostHeader({ post, myVote }: any) {
  const fetcher = useFetcher();

  // 🔥 Plug in realtime score
  const score = usePostScore(post.id, post.score);

  return (
    <div className="post-detail-upvote-container">
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="vote" />
        <input type="hidden" name="postId" value={post.id} />
        <input type="hidden" name="voteType" value="up" />
        <UpVote direction="up" filled={myVote === "up"} />
      </fetcher.Form>

      <p className="text-center">{score}</p>

      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="vote" />
        <input type="hidden" name="postId" value={post.id} />
        <input type="hidden" name="voteType" value="down" />
        <UpVote direction="down" filled={myVote === "down"} />
      </fetcher.Form>
    </div>
  );
}

/**
 * =========================================================
 * COMMENT VIEW (Recursive)
 * =========================================================
 */
function CommentView({ comment, myVotes, onAction }: any) {
  const fetcher = useFetcher();
  const [replying, setReplying] = useState(false);

  // 🔥 Realtime score for each comment
  const score = usePostScore(comment.id, comment.score);

  return (
    <div className="post-detail-comment-container">
      <div className="post-detail-comment-inner-container">
        <div className="post-detail-comment-upvote-container">
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="vote" />
            <input type="hidden" name="postId" value={comment.id} />
            <input type="hidden" name="voteType" value="up" />
            <UpVote direction="up" filled={myVotes?.[comment.id] === "up"} />
          </fetcher.Form>

          <p className="text-center">{score}</p>

          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="vote" />
            <input type="hidden" name="postId" value={comment.id} />
            <input type="hidden" name="voteType" value="down" />
            <UpVote direction="down" filled={myVotes?.[comment.id] === "down"} />
          </fetcher.Form>
        </div>

        <div>
          <p>
            {comment.author_name} - {timeAgo(comment.created_at)} ago
          </p>

          <p>{comment.content}</p>

          {replying ? (
            <CreateComment
              parent={comment}
              onSuccess={() => {
                setReplying(false);
                onAction();
              }}
            />
          ) : (
            <button onClick={() => setReplying(true)}>Reply</button>
          )}

          {comment.comments.map((child: Comment) => (
            <CommentView
              key={child.id}
              comment={child}
              myVotes={myVotes}
              onAction={onAction}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * =========================================================
 * CREATE COMMENT
 * =========================================================
 */
function CreateComment({ parent, onSuccess }: any) {
  const fetcher = useFetcher();

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="comment" />
      <input
        type="hidden"
        name="path"
        value={`${parent.path}.${parent.id.replaceAll("-", "_")}`}
      />

      <textarea name="content" placeholder="Write a comment..." />

      <button type="submit">Submit</button>
    </fetcher.Form>
  );
}

/**
 * =========================================================
 * COMMENT NESTING LOGIC (UNCHANGED)
 * =========================================================
 */

function unsortedCommentsToNested(comments: any[]): Comment[] {
  const map = comments.reduce((acc, c) => {
    acc[c.id] = { ...c, comments: [] };
    return acc;
  }, {} as Record<string, Comment>);

  const result: Comment[] = [];

  for (const comment of Object.values(map)) {
    const depth = getDepth(comment.path);

    if (depth === 1) {
      result.push(comment);
    } else {
      const parent = getParent(map, comment.path);
      parent.comments.push(comment);
    }
  }

  return result;
}

function getParent(map: Record<string, Comment>, path: string): Comment {
  const parentId = path.replace("root.", "").split(".").slice(-1)[0];
  return map[parentId.replaceAll("_", "-")];
}

function getDepth(path: string): number {
  return path.split(".").filter(Boolean).length;
}