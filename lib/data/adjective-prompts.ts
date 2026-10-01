export type AdjectivePrompt = {
  id: string;
  name: string;
  emoji: string;
  examples: string[];
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

export function promptById(id: string) {
  return adjectivePrompts.find((prompt) => prompt.id === id);
}
