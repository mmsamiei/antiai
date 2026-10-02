export type AdjectivePrompt = {
  id: string;
  name: string;
  emoji: string;
  examples: string[];
  partOfSpeech?: "صفت" | "اسم" | "فعل";
};

export const adjectivePrompts: AdjectivePrompt[] = [
  { id: "syn-scary", name: "ترسناک", emoji: "◈", examples: ["هولناک", "وحشت‌آور", "دهشتناک", "موحش", "دلهره‌آور", "هراس‌انگیز"] },
  { id: "syn-happy", name: "شاد", emoji: "✦", examples: ["خوشحال", "خرسند", "مسرور", "شاداب", "سرزنده", "بشاش"] },
  { id: "syn-sad", name: "غمگین", emoji: "✦", examples: ["اندوهگین", "افسرده", "دلگیر", "غم‌آلود", "سوگوار", "محزون"] },
  { id: "syn-beautiful", name: "زیبا", emoji: "✦", examples: ["قشنگ", "دلنشین", "جذاب", "خوش‌نما", "برازنده", "خوش‌منظر"] },
  { id: "syn-fast", name: "سریع", emoji: "↯", examples: ["تند", "پرشتاب", "شتابان", "سریع‌السیر", "چابک", "تیز"] },
  { id: "syn-calm", name: "آرام", emoji: "◌", examples: ["ساکت", "بی‌صدا", "ملایم", "آسوده", "قرار", "خونسرد"] },
  { id: "syn-brave", name: "شجاع", emoji: "▲", examples: ["دلیر", "جسور", "بی‌باک", "نترس", "جری", "جرئت‌مند"] },
  { id: "syn-smart", name: "باهوش", emoji: "◆", examples: ["زیرک", "هوشمند", "تیزهوش", "خردمند", "دانا", "فهمیده"] },
  { id: "syn-angry", name: "عصبانی", emoji: "♨", examples: ["خشمگین", "غضبناک", "برآشفته", "برافروخته", "خشم‌آلود", "خشماگین"] },
  { id: "syn-big", name: "بزرگ", emoji: "⬟", examples: ["عظیم", "کلان", "سترگ", "غول‌آسا", "فراخ", "وسیع"] },
  { id: "syn-small", name: "کوچک", emoji: "·", examples: ["ریز", "خرد", "کوچولو", "اندک", "مینیاتوری", "کم‌حجم"] },
  { id: "syn-hard", name: "سخت", emoji: "▰", examples: ["دشوار", "مشکل", "صعب", "طاقت‌فرسا", "پیچیده", "دردسرساز"] },
  { id: "syn-easy", name: "آسان", emoji: "⌁", examples: ["ساده", "راحت", "سهل", "بی‌دردسر", "روان", "کم‌زحمت"] },
  { id: "syn-dark", name: "تاریک", emoji: "☾", examples: ["تیره", "ظلمانی", "سیاه", "کم‌نور", "شبگون", "گرفته"] },
  { id: "syn-bright", name: "روشن", emoji: "☀", examples: ["نورانی", "درخشان", "تابان", "پرتو‌افشان", "پرنور", "شفاف"] },
  { id: "syn-hot", name: "گرم", emoji: "♨", examples: ["داغ", "سوزان", "حرارت‌آور", "آتشین", "گرمابخش", "تب‌دار"] },
  { id: "syn-cold", name: "سرد", emoji: "❄", examples: ["خنک", "یخ‌زده", "منجمد", "یخین", "سردسیر", "یخ‌بندان"] },
  { id: "syn-good", name: "خوب", emoji: "✓", examples: ["عالی", "نیکو", "پسندیده", "مطلوب", "خوشایند", "شایسته"] },
  { id: "syn-bad", name: "بد", emoji: "×", examples: ["ناخوشایند", "نامطلوب", "ناپسند", "زننده", "نامناسب", "بدوی"] },
  { id: "syn-strong", name: "قوی", emoji: "✹", examples: ["نیرومند", "توانمند", "مقتدر", "پرقدرت", "زورمند", "محکم"] },
  { id: "syn-weak", name: "ضعیف", emoji: "◒", examples: ["ناتوان", "سست", "کم‌توان", "نحیف", "فرسوده", "لاغر"] },
  { id: "syn-clean", name: "تمیز", emoji: "◇", examples: ["پاکیزه", "پاک", "نظیف", "مرتب", "آراسته", "بی‌لکه"] },
  { id: "syn-dirty", name: "کثیف", emoji: "◍", examples: ["آلوده", "چرک", "ناپاک", "پلید", "لکه‌دار", "ژولیده"] },
  { id: "syn-mysterious", name: "مرموز", emoji: "?", examples: ["اسرارآمیز", "رازآلود", "مبهم", "پوشیده", "معماگونه", "غریب"] },
  { id: "syn-clear", name: "واضح", emoji: "◎", examples: ["آشکار", "روشن", "شفاف", "بیّن", "صریح", "پیدا"] },
  { id: "syn-vague", name: "مبهم", emoji: "…", examples: ["گنگ", "ناروشن", "نامعلوم", "سربسته", "موهوم", "ناواضح"] }
];

const nounPrompts: AdjectivePrompt[] = [
  { id: "noun-home", name: "خانه", emoji: "⌂", partOfSpeech: "اسم", examples: ["منزل", "مسکن", "سرا", "کاشانه", "آشیانه"] },
  { id: "noun-friend", name: "دوست", emoji: "♡", partOfSpeech: "اسم", examples: ["یار", "رفیق", "همدم", "همراه", "آشنا"] },
  { id: "noun-enemy", name: "دشمن", emoji: "⚔", partOfSpeech: "اسم", examples: ["خصم", "بدخواه", "معاند", "رقیب", "ستیزه‌جو"] },
  { id: "noun-child", name: "کودک", emoji: "◡", partOfSpeech: "اسم", examples: ["بچه", "طفل", "نوباوه", "صغیر", "نوپا"] },
  { id: "noun-start", name: "شروع", emoji: "↯", partOfSpeech: "اسم", examples: ["آغاز", "ابتدا", "سرآغاز", "مبدأ", "افتتاح"] },
  { id: "noun-end", name: "پایان", emoji: "■", partOfSpeech: "اسم", examples: ["انتها", "خاتمه", "فرجام", "سرانجام", "عاقبت"] },
  { id: "noun-road", name: "راه", emoji: "⌁", partOfSpeech: "اسم", examples: ["مسیر", "جاده", "طریق", "گذرگاه", "معبر"] },
  { id: "noun-work", name: "کار", emoji: "◆", partOfSpeech: "اسم", examples: ["شغل", "پیشه", "فعالیت", "حرفه", "وظیفه"] },
  { id: "noun-knowledge", name: "دانش", emoji: "▤", partOfSpeech: "اسم", examples: ["علم", "آگاهی", "معرفت", "شناخت", "دانستگی"] },
  { id: "noun-calm", name: "آرامش", emoji: "◌", partOfSpeech: "اسم", examples: ["آسودگی", "سکون", "طمأنینه", "قرار", "صلح"] },
  { id: "noun-joy", name: "شادی", emoji: "✦", partOfSpeech: "اسم", examples: ["سرور", "نشاط", "خرمی", "خوشی", "شادمانی"] },
  { id: "noun-sorrow", name: "غم", emoji: "☾", partOfSpeech: "اسم", examples: ["اندوه", "حزن", "دلتنگی", "سوگ", "افسوس"] },
  { id: "noun-sound", name: "صدا", emoji: "♪", partOfSpeech: "اسم", examples: ["آوا", "بانگ", "نوا", "طنین", "صوت"] },
  { id: "noun-light", name: "نور", emoji: "☀", partOfSpeech: "اسم", examples: ["روشنایی", "پرتو", "تابش", "فروغ", "درخشندگی"] },
  { id: "noun-time", name: "زمان", emoji: "◷", partOfSpeech: "اسم", examples: ["وقت", "هنگام", "برهه", "دوره", "زمانه"] }
];

const verbPrompts: AdjectivePrompt[] = [
  { id: "verb-see", name: "دیدن", emoji: "◉", partOfSpeech: "فعل", examples: ["نگریستن", "تماشا کردن", "مشاهده کردن", "نظر کردن", "دید زدن"] },
  { id: "verb-say", name: "گفتن", emoji: "◌", partOfSpeech: "فعل", examples: ["بیان کردن", "اظهار کردن", "سخن گفتن", "بازگو کردن", "حکایت کردن"] },
  { id: "verb-go", name: "رفتن", emoji: "→", partOfSpeech: "فعل", examples: ["حرکت کردن", "روانه شدن", "عزیمت کردن", "رهسپار شدن", "راهی شدن"] },
  { id: "verb-come", name: "آمدن", emoji: "←", partOfSpeech: "فعل", examples: ["رسیدن", "وارد شدن", "حاضر شدن", "پدیدار شدن", "دررسیدن"] },
  { id: "verb-eat", name: "خوردن", emoji: "◒", partOfSpeech: "فعل", examples: ["بلعیدن", "میل کردن", "غذا خوردن", "نوش جان کردن", "تناول کردن"] },
  { id: "verb-sleep", name: "خوابیدن", emoji: "☾", partOfSpeech: "فعل", examples: ["خفتن", "آرمیدن", "استراحت کردن", "به خواب رفتن", "چرت زدن"] },
  { id: "verb-run", name: "دویدن", emoji: "↯", partOfSpeech: "فعل", examples: ["شتافتن", "تکاپو کردن", "پا به فرار گذاشتن", "تند رفتن", "یورتمه رفتن"] },
  { id: "verb-build", name: "ساختن", emoji: "▰", partOfSpeech: "فعل", examples: ["ایجاد کردن", "پدید آوردن", "تولید کردن", "بنا کردن", "درست کردن"] },
  { id: "verb-hide", name: "پنهان کردن", emoji: "◈", partOfSpeech: "فعل", examples: ["مخفی کردن", "پوشاندن", "نهفتن", "مستور کردن", "پنهان ساختن"] },
  { id: "verb-ask", name: "پرسیدن", emoji: "?", partOfSpeech: "فعل", examples: ["سؤال کردن", "جویا شدن", "استفسار کردن", "پرس‌وجو کردن", "بازخواست کردن"] },
  { id: "verb-learn", name: "یاد گرفتن", emoji: "✦", partOfSpeech: "فعل", examples: ["آموختن", "فراگرفتن", "تعلیم دیدن", "یادگیری کردن", "دانش اندوختن"] },
  { id: "verb-help", name: "کمک کردن", emoji: "♡", partOfSpeech: "فعل", examples: ["یاری کردن", "دستگیری کردن", "معاونت کردن", "یار شدن", "مدد کردن"] },
  { id: "verb-fear", name: "ترسیدن", emoji: "△", partOfSpeech: "فعل", examples: ["هراسیدن", "بیم داشتن", "واهمه داشتن", "وحشت کردن", "بیمناک شدن"] },
  { id: "verb-understand", name: "فهمیدن", emoji: "◆", partOfSpeech: "فعل", examples: ["دریافتن", "درک کردن", "پی بردن", "متوجه شدن", "فهم کردن"] },
  { id: "verb-love", name: "دوست داشتن", emoji: "♥", partOfSpeech: "فعل", examples: ["عاشق بودن", "محبت کردن", "دل‌بستن", "علاقه داشتن", "مهر ورزیدن"] }
];

export const wordPrompts = [...adjectivePrompts, ...nounPrompts, ...verbPrompts];

export function promptById(id: string) {
  return wordPrompts.find((prompt) => prompt.id === id);
}

export function challengeForPrompt(prompt: AdjectivePrompt): string {
  return [...prompt.examples].reverse().find((word) => /^[\p{L}]+$/u.test(word)) || prompt.examples[0];
}

export function maskChallenge(word: string): string {
  return word.split(/([\s‌]+)/u).map((part) => {
    if (/^[\s‌]+$/u.test(part)) return " ";
    const letters = [...part];
    const revealed = letters.length >= 5 ? 2 : 1;
    return `${letters.slice(0, revealed).join("")} ${"_ ".repeat(Math.max(0, letters.length - revealed)).trim()}`;
  }).join("");
}
