"use client";

import type { ReactNode } from "react";

export default function OnlineAvatar({ online, children, className = "" }: { online: boolean; children: ReactNode; className?: string }) {
  return <span className={`online-avatar ${className}`}>
    {children}
    {online && <span className="online-avatar-dot" role="img" aria-label="آنلاین" />}
  </span>;
}
