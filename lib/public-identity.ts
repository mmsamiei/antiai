export type Identity = { username?: string | null; firstName?: string | null; lastName?: string | null; showUsername?: boolean };
export function publicUsername(user: Identity | undefined | null) {
  return user?.showUsername === false ? null : user?.username ?? null;
}
export function publicDisplayName(user: Identity | undefined | null, preferUsername = false) {
  const username = publicUsername(user);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  return (preferUsername && username ? `@${username}` : name || username) || "بازیکن ناشناس";
}
export function publicIdentity<T extends { username: string | null; showUsername?: boolean }>(user: T) {
  const { showUsername: _visibility, ...rest } = user;
  return { ...rest, username: publicUsername(user) };
}
