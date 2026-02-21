import { type RouteConfig, layout, route } from "@react-router/dev/routes";

export default [
    // 1. Top Level Layout (Wraps everything)
  layout("routes/layout.tsx", [
    
    // 2. Message Board Wrapper (Nested Layout)
    layout("routes/messageBoard.tsx", [
        // ✅ This ONE line replaces both the 'index' and the old ':pageNumber' route
      // The '?' makes the page number optional so it matches "/" and "/1", "/2", etc.
      route("/:pageNumber?", "routes/allPosts.tsx"),
      
      // path: "" (The base of the message board)
    //   index("routes/allPosts.tsx"), 
      
      // path: ":pageNumber" (Pagination)
    //   route(":pageNumber", "routes/allPosts.tsx"),
      
      // path: "post/:postId" (Individual Post View)
      route("post/:postId", "routes/postView.tsx"),
    ]),

    // 3. path: "welcome" (Standalone page inside the main Layout)
    route("welcome", "routes/welcome.tsx"),
    ])
] satisfies RouteConfig;
