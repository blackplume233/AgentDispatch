import type React from "react";
import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./top-bar";

export function Shell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
