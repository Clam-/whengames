import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { BrowserRouter, Routes, Route } from "react-router";
import App from "./App";
import { ScheduleView } from "./components/ScheduleView";
import { AuthCallback } from "./components/AuthCallback";
import "./index.css";

const convex = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL as string
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <AuthCallback />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/schedule/:id" element={<ScheduleView />} />
        </Routes>
      </BrowserRouter>
    </ConvexAuthProvider>
  </StrictMode>
);
