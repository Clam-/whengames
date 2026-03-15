"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProvider } from "convex/react";

import type { PublicUser, ViewerSession } from "@/lib/types";

const client = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://placeholder.convex.cloud"
);

type ViewerContextValue = {
  isLoading: boolean;
  session: ViewerSession | null;
  user: PublicUser | null;
  refresh: () => Promise<void>;
};

const ViewerContext = createContext<ViewerContextValue>({
  isLoading: true,
  session: null,
  user: null,
  refresh: async () => undefined
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<ViewerSession | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);

  const refresh = async () => {
    setIsLoading(true);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const response = await fetch("/api/session", {
      headers: {
        "x-timezone": timezone
      },
      cache: "no-store"
    });
    const payload = (await response.json()) as {
      session: ViewerSession;
      user: PublicUser;
    };
    setSession(payload.session);
    setUser(payload.user);
    setIsLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <ConvexProvider client={client}>
      <ViewerContext.Provider value={{ isLoading, session, user, refresh }}>
        {children}
      </ViewerContext.Provider>
    </ConvexProvider>
  );
}

export const useViewer = () => useContext(ViewerContext);
