import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "./AppShell";

export const metadata: Metadata = {
  robots: "noindex, nofollow",
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
