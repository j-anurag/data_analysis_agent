"use client";
import React from "react";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen text-slate-100 selection:bg-blue-500/30 selection:text-white">
      {children}
    </div>
  );
}
