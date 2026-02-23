import { Link } from "react-router";
import { useUser } from "~/lib/sessionContext";
import UserMenu from "~/userMenu";
import Login from "~/login";

export default function Navbar() {
  const { session, profile, loading } = useUser()
  return (
    <>
      <nav className="nav-bar">
        <Link className="nav-logo-link" to="/">
          <img
            id="logo"
            className="nav-logo"
            src="https://supaship.io/supaship_logo_with_text.svg"
            alt="logo"
          />
        </Link>

        <ul className="nav-right-list">
          <li className="nav-message-board-list-item">
            <Link to="/1" className="nav-message-board-link">
              message board
            </Link>
          </li>
          <li className="nav-auth-item">
            {!loading ? (session?.user ? <UserMenu /> : <Login />) : '...'}
          </li>
        </ul>
      </nav>

    </>
  );
}