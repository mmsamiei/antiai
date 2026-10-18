export const WORD_WEAVER_MISSION_TYPES = ["missing_word", "show_dont_tell", "best_adjective"] as const;
export type WordWeaverMissionType = typeof WORD_WEAVER_MISSION_TYPES[number];

export type WordWeaverMission = {
  id: string;
  type: WordWeaverMissionType;
  typeLabel: string;
  prompt: string;
  instruction: string;
  hint: string;
};

// Prompts are reviewed, reusable writing exercises; game-time generation is not needed.
export const wordWeaverMissions: WordWeaverMission[] = [
  ...[
    ["apology-mask", "بعضی عذرخواهی‌ها فقط شکل مؤدبانهٔ _____ هستند."],
    ["truth-last", "آدم‌ها گاهی وقتی حقیقت را می‌گویند که دیگر _____ ندارند."],
    ["quiet-room", "در اتاقی که همه از هم دلخورند، سکوت شبیه _____ است."],
    ["victory-cost", "پیروزی‌ای که کسی را تنها بگذارد، بیشتر شبیه _____ است."],
    ["jealousy-color", "اگر حسادت یک رنگ بود، _____ بود."],
    ["goodbye-gift", "بدترین هدیه برای کسی که دارد می‌رود، _____ است."],
    ["memory-door", "خاطره دری است که _____ ."],
    ["city-secret", "هر شهر یک راز دارد؛ راز این شهر _____ است."],
    ["fear-pocket", "ترس را که از جیبش درآورد، _____ بود."],
    ["promise-paper", "وعده‌ای که زیادی تا بخورد، _____ می‌شود."],
    ["lonely-table", "تنهایی سر میز جایی برای _____ گذاشت."],
    ["hope-rain", "امید بعد از باران، روی _____ سبز شد."],
    ["pride-window", "غرور پنجره‌ای است که _____ ."],
    ["tired-clock", "ساعت از خستگیِ انتظار، _____ را جا انداخت."],
    ["envy-mirror", "حسادت آینه‌ای است که _____ نشان می‌دهد."],
    ["home-sound", "خانه وقتی خانه است که صدای _____ از آن بیاید."],
    ["regret-ticket", "پشیمانی بلیتِ سفری است به _____ ."],
    ["kindness-small", "مهربانی گاهی فقط _____ است."],
    ["anger-teacup", "خشم در فنجان _____ جا نمی‌شد."],
    ["freedom-key", "کلید آزادی را در جیب _____ پیدا کرد."],
  ].map(([id, prompt]) => ({ id, type: "missing_word" as const, typeLabel: "کلمهٔ گمشده", prompt, instruction: "جای خالی را با یک یا چند واژهٔ کوتاه و معنادار کامل کن. پاسخ باید جمله را کامل کند و برداشتی تازه یا دقیق بسازد.", hint: "جای خالی را با یک یا چند واژه پر کن." })),
  ...[
    ["show-defeat", "شکست را نشان بده، بدون گفتن اسمش."],
    ["show-waiting", "انتظار را نشان بده، بدون گفتن اسمش."],
    ["show-longing", "دلتنگی را با یک تصویر نشان بده؛ اسم احساس را نیاور."],
    ["show-envy", "حسادت را نشان بده، بدون نام‌بردن از احساسات."],
    ["show-relief", "آسودگی بعد از یک نگرانی طولانی را نشان بده."],
    ["show-poverty", "بی‌پولی را با یک تصویر نشان بده؛ مستقیم از پول حرف نزن."],
    ["show-breakup", "تمام‌شدن یک رابطه را با یک جزئیات نشان بده."],
    ["show-boredom", "بی‌حوصلگی را نشان بده، بدون اینکه بگویی کسی حوصله‌اش سر رفته."],
    ["show-hope", "امید را با چیزی کوچک و ملموس نشان بده."],
    ["show-guilt", "عذاب وجدان را در یک تصویر کوتاه نشان بده."],
    ["show-party-end", "با یک جزئیات نشان بده مهمانی تمام شده است."],
    ["show-empty-home", "نشان بده صاحب این خانه مدت‌هاست رفته."],
    ["show-nervous", "اضطراب پیش از یک خبر مهم را نشان بده."],
    ["show-forgiveness", "بخشیدن را نشان بده، بدون اینکه از بخشش اسم ببری."],
    ["show-old-age", "گذشت زمان را روی یک شیء نشان بده."],
    ["show-secret", "نشان بده کسی رازی را پنهان می‌کند."],
    ["show-silence", "یک سکوت سنگین را با چند واژه تصویر کن."],
    ["show-missed-call", "با یک جزئیات نشان بده کسی منتظر تماس بوده."],
    ["show-loneliness", "تنهایی را نشان بده، بدون گفتن نامش."],
    ["show-courage", "شجاعت را با یک حرکت کوچک نشان بده."],
  ].map(([id, prompt]) => ({ id, type: "show_dont_tell" as const, typeLabel: "اسمش رو نبر", prompt, instruction: "مفهوم را با تصویر، رفتار یا جزئیات ملموس نشان بده. خود مفهوم و واژه‌های هم‌معنای مستقیمش را نیاور. پاسخ کوتاه باشد.", hint: "اسم احساس را نیاور؛ یک تصویر یا جزئیات بساز." })),
  ...[
    ["adjective-silence", "یک صفت دقیق یا غیرمنتظره برای سکوت پیدا کن."],
    ["adjective-justice", "برای عدالت صفتی معنادار و تازه انتخاب کن."],
    ["adjective-rain", "بارانی که درست در روز سفر شروع شده، چه بارانی است؟"],
    ["adjective-memory", "برای خاطره‌ای که آدم دلش نمی‌خواهد به یاد بیاورد، یک صفت پیدا کن."],
    ["adjective-city", "برای شهری که آدم در آن گم می‌شود، یک صفت دقیق انتخاب کن."],
    ["adjective-apology", "برای عذرخواهی‌ای که دیر رسیده، یک صفت انتخاب کن."],
    ["adjective-friendship", "برای دوستی‌ای که فقط وقت نیاز پیداست، یک صفت دقیق بنویس."],
    ["adjective-night", "برای شبی که خبر بدی در آن می‌رسد، یک صفت پیدا کن."],
    ["adjective-hope", "برای امیدی که هنوز دلیل محکمی ندارد، یک صفت انتخاب کن."],
    ["adjective-question", "برای سؤالی که جوابش را همه می‌دانند اما نمی‌گویند، یک صفت بنویس."],
    ["adjective-victory", "برای پیروزی‌ای که مزهٔ خوبی ندارد، یک صفت دقیق انتخاب کن."],
    ["adjective-house", "برای خانه‌ای که صاحبش در آن احساس غریبی می‌کند، یک صفت پیدا کن."],
    ["adjective-sleep", "برای خوابی که آدم را خسته‌تر بیدار می‌کند، یک صفت بنویس."],
    ["adjective-laughter", "برای خنده‌ای که چیزی را پنهان می‌کند، یک صفت انتخاب کن."],
    ["adjective-promise", "برای وعده‌ای که گوینده خودش هم باورش ندارد، یک صفت پیدا کن."],
    ["adjective-winter", "برای زمستانی که طولانی‌تر از تقویم حس می‌شود، یک صفت بنویس."],
    ["adjective-gift", "برای هدیه‌ای که زیادی شبیه وظیفه است، یک صفت انتخاب کن."],
    ["adjective-path", "برای راهی که آدم را به گذشته برمی‌گرداند، یک صفت پیدا کن."],
    ["adjective-silence2", "برای سکوتی که جواب یک سؤال است، صفتی دقیق یا تازه بنویس."],
    ["adjective-person", "برای کسی که همیشه حرف آخر را می‌زند، صفتی بامزه اما دقیق پیدا کن."],
  ].map(([id, prompt]) => ({ id, type: "best_adjective" as const, typeLabel: "واژهٔ دقیق‌تر", prompt, instruction: "یک صفت یا ترکیب وصفی کوتاه بنویس. تناسب و دقت معنا مهم است؛ تازگی خوب است اما عجیب‌بودن بی‌دلیل امتیاز ندارد.", hint: "یک صفت یا ترکیب کوتاه بنویس؛ شمارش واژه نداریم." })),
];

export function getWordWeaverMission(id: string | null | undefined) {
  return wordWeaverMissions.find((mission) => mission.id === id) || null;
}

export function chooseWordWeaverMissions(recentIds: string[], random: (max: number) => number, count = 3) {
  const recent = new Set(recentIds);
  const fresh = wordWeaverMissions.filter((mission) => !recent.has(mission.id));
  const pool = fresh.length >= count ? fresh : wordWeaverMissions;
  const choices = [...pool];
  const selected: WordWeaverMission[] = [];
  while (choices.length && selected.length < count) selected.push(choices.splice(random(choices.length), 1)[0]);
  return selected;
}

export function getWordWeaverFeedback(type: string | null | undefined, missionFit: number, precision: number, originality: number) {
  const lowest = Math.min(missionFit, precision, originality);
  if (lowest === missionFit) {
    return type === "show_dont_tell"
      ? "برای انتقال مفهوم، از یک نشانهٔ ملموس‌تر استفاده کن و اسم خودِ احساس را نیاور."
      : "پاسخ را مستقیم‌تر به صورت سؤال وصل کن؛ یک واژهٔ دقیق می‌تواند این پیوند را روشن کند.";
  }
  if (lowest === precision) return "تصویر یا انتخاب واژه‌ات را کمی روشن‌تر و ملموس‌تر کن تا منظورت زودتر دریافت شود.";
  return "معنا روشن است؛ یک تعبیر کمتر آشنا می‌تواند پاسخ را به‌یادماندنی‌تر کند.";
}
