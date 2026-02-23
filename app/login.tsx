import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared"; // Use shared for theme
import { useState } from "react";
import { useUser } from "./lib/sessionContext";
import Dialog from "./dialog";
import { supaClient } from "./lib/supaClient";

export default function Login() {
  const [showModal, setShowModal] = useState(false);
  const [authMode, setAuthMode] = useState<"sign_in" | "sign_up">("sign_in");
  const { session } = useUser();

  // If already logged in, we can hide the login buttons entirely
  if (session) return null;

  return (
    <>
      <div className="flex m-4 place-items-center">
        <button
          className="login-button"
          onClick={() => {
            setAuthMode("sign_in");
            setShowModal(true);
          }}
        >
          login
        </button>{" "}
        <span className="p-2"> or </span>{" "}
        <button
          className="login-button"
          onClick={() => {
            setAuthMode("sign_up");
            setShowModal(true);
          }}
        >
          sign up
        </button>
      </div>
      <Dialog
        open={showModal}
        onClose={() => setShowModal(false)}
        contents={
          <div className="p-4">
            <Auth
              supabaseClient={supaClient}
              view={authMode}
              appearance={{
                theme: ThemeSupa,
                className: {
                  container: "login-form-container",
                  label: "login-form-label",
                  button: "login-form-button",
                  input: "login-form-input",
                },
              }}
              // Modern Auth UI automatically switches views, 
              // but we pass our initial state here.
              showLinks={true}
            />
            <button className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
             onClick={() => setShowModal(false)}>Close</button>
          </div>
        }
      />
    </>
  );
}