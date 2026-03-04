import { Form, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/welcome";
import Dialog from "../dialog";
import { getSupaServer } from "~/lib/supaServer";
// import { supaClient } from "../lib/supaClient";
// import { useState } from "react";

/**
 * 1. THE LOADER (Guard Duty)
 * Runs on the server before the page renders.
 * Ensures only logged-in users who MISS a username can see this page. (Zero-Flicker Guard)
 */

export async function loader({ request }: Route.LoaderArgs) {
    const { supaServer, headers } = getSupaServer(request)
// Server-side Auth Check
  const { data: { user } } = await supaServer.auth.getUser();
  
  // If no user is logged in, boot them to the home feed
  if (!user) return redirect("/", {headers});

  // Check if they already have a profile in Supabase
  const { data } = await supaServer
    .from("user_profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle();

  // If they already have a username, they don't belong here
  if (data?.username) return redirect("/", {headers});

  return { user };
}
// 1. Change 'loader' to 'clientLoader'
// This ensures it runs in the browser where LocalStorage exists
// export async function clientLoader({ request }: Route.ClientLoaderArgs) {
//   const { data: { user } } = await supaClient.auth.getUser();
  
//   // If no user is logged in, boot them to the home feed
//   if (!user) return redirect("/");

//   // Check if they already have a profile in Supabase
//   const { data } = await supaClient
//     .from("user_profiles")
//     .select("username")
//     .eq("user_id", user.id)
//     .single();

//   // If they already have a username, they don't belong here
//   if (data?.username) return redirect("/");

//   return { user };
// }

// 2. Add this to make it run on the very first page load (hydration)
// clientLoader.hydrate = true;

/**
 * 2. THE ACTION (The "Final Truth" Validation)
 * Runs when the <Form> is submitted.
 * Handles the database insertion and "Username Taken" errors.
 */
export async function action({ request }: Route.ActionArgs) {
  const {supaServer, headers} = getSupaServer(request)
  const formData = await request.formData();
  // 1. Get the user
  const { data: { user } } = await supaServer.auth.getUser();

  // 2. Safety Check: If no user, we can't insert. 
  // This satisfies the "string | undefined" TS error.
  if (!user) {
    return redirect("/", { headers });
  }

  /**
   * Extract username from submitted form.
   * We must verify it is actually a string.
   */
  const raw = formData.get("username");

  if (typeof raw !== "string") {
    return { error: "Invalid submission." };
  }

  // Remove accidental whitespace
  const username = raw.trim();

  /**
   * -----------------------------
   * Server-side Validation Rules
   * -----------------------------
   * These mirror the browser rules,
   * but are required for security.
   */

  if (username.length < 3) {
    return { error: "Username must be at least 3 characters long." };
  }

  if (username.length > 15) {
    return { error: "Username must be less than 15 characters long." };
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return {
      error:
        "Username can only contain letters, numbers, and underscores.",
    };
  }

  /**
   * Insert into database.
   *
   * .select() is important:
   * It forces PostgREST to return proper errors
   * (like unique constraint violations).
   */

  // Final Server-side Database Insert
  const { error } = await supaServer.from("user_profiles").insert(
    {
      user_id: user.id,
      username: username,
    },
  ).select();

  // Handle the "Unique Violation" error (Postgres error code 23505)
  if (error) {
    if (error.code === "23505") {
      return { error: `Username "${username}" is already taken` };
    }
    console.log(error)
    return { error: "An unexpected error occurred. Please try again." };
  }

  // Success! Send them to the path they were on before, or home.
  // Note: You can still use your localStorage 'returnPath' logic here via client-side redirect if preferred
  return redirect("/", {headers});
}

/**
 * 3. THE VIEW (The UI)
 */
export default function Welcome() {
  // Access data returned from the 'action' (like our error message)
  const actionData = useActionData<typeof action>();
  
  // Use navigation state to show a "Loading..." spinner on the button
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  // 2. Handle input changes to check validity
  // const [isValid, setIsValid] = useState(false)
  // const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // checkValidity() triggers the browser's built-in validation logic
    // setIsValid(e.currentTarget.form?.checkValidity() ?? false);
    // setIsValid((e.currentTarget.form?.length !== 0));

  // };

  return (
    <Dialog
      open={true}
      onClose={() => {}} // User cannot close this until they pick a name
      contents={
        <div className="p-4">
          <h2 className="welcome-header text-xl font-bold text-center">
            Welcome to Supaship!!
          </h2>
          <p className="text-center text-gray-600 my-4">
            Let's get started by creating a username:
          </p>

          {/* 
            React Router <Form> handles the request automatically 
            without needing a manual 'handleSubmit' function.
          */}
          <Form method="post" className="welcome-name-form flex flex-col gap-4">
            <input
              name="username"
              placeholder="Username"
              className="welcome-name-input p-2 border rounded"
              autoFocus
              required                  // Browser-level validation: Can't be empty
              minLength={4}             // Browser-level validation: Min length
              maxLength={14}            // Browser-level validation: Max length
              pattern="^[a-zA-Z0-9_]+$" // Browser-level validation: Regex for chars
            />

            {/* Display errors from the Database (like "Username Taken") */}
            {actionData?.error && (
              <p className="validation-feedback text-red-500 text-sm text-center">
                {actionData.error}
              </p>
            )}

            <p className="text-center text-xs text-gray-500 px-4">
              This is the name people will see you as on the Message Board. 
              Only letters, numbers, and underscores allowed.
            </p>

            <button
              className="welcome-form-submit-button bg-orange-600 text-white p-2 rounded disabled:opacity-50"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Submit"}
            </button>
          </Form>
        </div>
      }
    />
  );
}
