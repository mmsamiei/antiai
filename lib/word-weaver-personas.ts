import { publicDisplayName, publicUsername } from "./public-identity";
export const WORD_WEAVER_BOT_MODEL = "openai/gpt-6-luna";
export const WORD_WEAVER_BOT_PROMPT_VERSION = "2";
export const wordWeaverPersonas = [
  { id: "jalal", name: "جلال آل‌احمد", style: "نثر فارسی موجز، محاوره‌ای، ضرباهنگ تند، نگاه ملموس به زندگی روزمره و رگه‌ای از نقد اجتماعی؛ با الهام از ویژگی‌های نثر جلال آل‌احمد." },
  { id: "camus", name: "آلبر کامو", style: "نثر فارسی روشن و کم‌پیرایه، جمله‌های کوتاه، تصویرهای حسیِ نور و طبیعت، تنهایی و مواجههٔ آرام با پوچی؛ با الهام از ویژگی‌های نثر آلبر کامو." },
] as const;

export type WordWeaverHuman = { id: string; firstName: string | null; lastName: string | null; username: string | null; showUsername?: boolean; photoUrl: string | null };
export function wordWeaverActor(entry: { user: WordWeaverHuman | null; botPersonaId?: string | null }) {
  if (entry.user) return {
    id: entry.user.id, displayName: publicDisplayName(entry.user),
    username: publicUsername(entry.user), photoUrl: entry.user.photoUrl, isBot: false,
  };
  const persona = wordWeaverPersonas.find((item) => item.id === entry.botPersonaId);
  return { id: `word-weaver-bot:${entry.botPersonaId}`, displayName: persona?.name || "نویسندهٔ هوش مصنوعی", username: null, photoUrl: null, isBot: true };
}

export function selectWordWeaverWinners<T extends { id: string; userId: string | null; finalScore: number | null }>(entries: T[], random: (max: number) => number) {
  const choose = (candidates: T[]) => {
    const valid = candidates.filter((item) => item.finalScore !== null);
    if (!valid.length) return null;
    const highest = valid.reduce((highest, item) => Math.max(highest, item.finalScore!), -Infinity);
    const tied = valid.filter((item) => item.finalScore === highest);
    return tied[random(tied.length)];
  };
  const winner = choose(entries);
  const human = winner?.userId ? winner : choose(entries.filter((item) => item.userId !== null));
  return { winner, nextWordPickerUserId: human?.userId || null };
}
