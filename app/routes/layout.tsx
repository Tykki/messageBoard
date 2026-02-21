import { Outlet } from "react-router";
import Navbar from "~/navbar/navbar";

export default function SiteLayout() {
  return (
      <>
        <Navbar />
        <Outlet /> {/* This is where MessageBoard or Welcome will appear */}
      </>
  );
}
