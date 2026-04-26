import { useState, useEffect } from "react";
import { detectTimezone } from "../lib/timezone";

/**
 * Hook to manage the user's timezone.
 * Detects from browser, can be overridden from user preferences.
 */
export function useTimezone(overrideTimezone?: string) {
  const [timezone, setTimezone] = useState<string>(() => {
    return overrideTimezone || detectTimezone();
  });

  useEffect(() => {
    if (overrideTimezone) {
      setTimezone(overrideTimezone);
    }
  }, [overrideTimezone]);

  return { timezone, setTimezone };
}
