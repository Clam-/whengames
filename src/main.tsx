import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { BrowserRouter, Routes, Route } from "react-router";
import { GoogleAuthProvider, useConvexGoogleAuth } from "./lib/googleAuth";
import { loadConfig } from "./config";
import App from "./App";
import { ScheduleView } from "./components/ScheduleView";
import { AuthCallbackPage } from "./components/AuthCallbackPage";
import { AuthProfileSync } from "./components/AuthProfileSync";
import "./index.css";

loadConfig().then((cfg) => {
  const convex = new ConvexReactClient(cfg.CONVEX_URL);

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <GoogleAuthProvider>
        <ConvexProviderWithAuth client={convex} useAuth={useConvexGoogleAuth}>
          <AuthProfileSync />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<App />} />
              <Route path="/schedule/:id" element={<ScheduleView />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
            </Routes>
          </BrowserRouter>
        </ConvexProviderWithAuth>
      </GoogleAuthProvider>
    </StrictMode>,
  );
});
