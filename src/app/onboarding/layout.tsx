"use client";

import { Toaster as SonnerToaster } from "sonner";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <SonnerToaster
        position="bottom-right"
        toastOptions={{ classNames: { toast: "font-sans text-sm" } }}
      />
    </>
  );
}
