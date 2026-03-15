import type { Metadata } from "next";

import "@/app/globals.css";

import { APP_NAME } from "@/lib/constants";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Public schedules for coordinating games across timezones."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
