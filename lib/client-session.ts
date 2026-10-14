"use client";

let sessionToken = "";

export function setClientSessionToken(token: string) {
  sessionToken = token;
}

export function sessionRequest(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
  return { ...init, credentials: "include", headers };
}
