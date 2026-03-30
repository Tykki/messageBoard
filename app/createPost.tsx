import { Form, useActionData, useNavigation } from "react-router";
import { useEffect, useRef } from "react";
import { getSupaServer } from "./lib/supaServer";
import type { Route } from "./routes/+types/createPost";

/**
 * =========================================================
 * ACTION (Server-Side Post Creation)
 * =========================================================
 * This replaces client-side Supabase calls.
 *
 * Responsibilities:
 * - Authenticate user
 * - Validate form input
 * - Insert into database tables
 * - Return success/error state
 */
export async function action({ request }: Route.ActionArgs) {
  const { supaServer, headers } = getSupaServer(request);
  const formData = await request.formData();

  // Extract form data
  const title = formData.get("title");
  const content = formData.get("content");

  // Basic validation
  if (typeof title !== "string" || typeof content !== "string") {
    return { error: "Invalid form submission." };
  }

  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();

  if (trimmedTitle.length < 5) {
    return { error: "Title must be at least 5 characters long." };
  }

  if (trimmedContent.length < 10) {
    return { error: "Content must be at least 10 characters long." };
  }

  // Authenticate user (server-side, secure)
  const {
    data: { user },
  } = await supaServer.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to create a post." };
  }

  /**
   * ---------------------------------------------------------
   * DATABASE INSERT FLOW
   * ---------------------------------------------------------
   * Equivalent to your previous RPC "create_new_post"
   */

  // Create a simple URL-friendly path (slug)
  const path = trimmedTitle.toLowerCase().replace(/\s+/g, "-");

  // 1. Insert into posts table
  const { data: post, error: postError } = await supaServer
    .from("posts")
    .insert({
      user_id: user.id,
      path,
    })
    .select()
    .single();

  if (postError || !post) {
    console.error(postError);
    return { error: "Failed to create post." };
  }

  // 2. Insert post content
  const { error: contentError } = await supaServer
    .from("post_contents")
    .insert({
      post_id: post.id,
      user_id: user.id,
      title: trimmedTitle,
      content: trimmedContent,
    });

  if (contentError) {
    console.error(contentError);
    return { error: "Failed to save post content." };
  }

  // 3. Initialize post score
  const { error: scoreError } = await supaServer
    .from("post_score")
    .insert({
      post_id: post.id,
      score: 0,
    });

  if (scoreError) {
    console.error(scoreError);
    return { error: "Failed to initialize post score." };
  }

  /**
   * Return success instead of redirect so UI can:
   * - clear inputs
   * - trigger refresh
   */
  return { success: true };
}

/**
 * =========================================================
 * COMPONENT (Create Post Form)
 * =========================================================
 * Handles:
 * - Rendering form
 * - Displaying errors
 * - Clearing inputs on success
 * - Triggering parent refresh callback
 */

export interface CreatePostProps {
  newPostCreated?: () => void;
}

export function CreatePost({ newPostCreated }: CreatePostProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const isSubmitting = navigation.state === "submitting";

  /**
   * ---------------------------------------------------------
   * SUCCESS EFFECT
   * ---------------------------------------------------------
   * Mimics your original behavior:
   * - clear inputs
   * - notify parent component
   */
  useEffect(() => {
    if (actionData?.success) {
      if (titleRef.current) titleRef.current.value = "";
      if (contentRef.current) contentRef.current.value = "";

      newPostCreated?.();
    }
  }, [actionData, newPostCreated]);

  return (
    <Form method="post" className="create-post-form" data-e2e="create-post-form">
      <h3>Create A New Post</h3>

      <input
        type="text"
        name="title"
        ref={titleRef}
        placeholder="Your Title Here"
        className="create-post-title-input"
        required
        minLength={5}
      />

      <textarea
        name="content"
        ref={contentRef}
        placeholder="Your content here"
        className="create-post-content-input"
        required
        minLength={10}
      />

      {actionData?.error && (
        <p className="text-red-500 text-sm">{actionData.error}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="create-post-submit-button"
      >
        {isSubmitting ? "Submitting..." : "Submit"}
      </button>
    </Form>
  );
}