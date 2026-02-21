import { Outlet } from "react-router";
import { Link } from "react-router";
export default function MessageBoard() {
  return (
    <div className="message-board-container">
      <Link to="/1">
        <h2 className="message-board-header-link">Message Board</h2>
      </Link>
      <Outlet />
    </div>
  );
}