export function avatarImageUrl(userId: string | number, photoUrl: string | null | undefined) {
  if (!photoUrl) return null;
  return `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/avatar/${encodeURIComponent(String(userId))}`;
}
