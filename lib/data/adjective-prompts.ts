export type AdjectivePrompt = {
  id: string;
  name: string;
  emoji: string;
  examples: string[];
};

export const adjectivePrompts: AdjectivePrompt[] = [
  { id: "glass", name: "شیشه", emoji: "◈", examples: ["شفاف", "شکننده", "براق", "نازک", "سرد"] },
  { id: "sea", name: "دریا", emoji: "≈", examples: ["عمیق", "آرام", "خروشان", "پهناور", "آبی"] },
  { id: "sky", name: "آسمان", emoji: "☁", examples: ["آبی", "ابری", "صاف", "تیره", "پهن"] },
  { id: "road", name: "جاده", emoji: "⌁", examples: ["باریک", "طولانی", "پیچیده", "خلوت", "شلوغ"] },
  { id: "book", name: "کتاب", emoji: "▤", examples: ["خواندنی", "آموزنده", "ضخیم", "جذاب", "قدیمی"] },
  { id: "sound", name: "صدا", emoji: "♪", examples: ["آرام", "بلند", "دلنشین", "خشن", "واضح"] },
  { id: "friend", name: "دوست", emoji: "♡", examples: ["وفادار", "صمیمی", "مهربان", "قابل‌اعتماد", "خوش‌اخلاق"] },
  { id: "face", name: "چهره", emoji: "◌", examples: ["زیبا", "خندان", "غمگین", "آشنا", "خسته"] },
  { id: "food", name: "غذا", emoji: "◒", examples: ["خوش‌طعم", "گرم", "تند", "تازه", "سالم"] },
  { id: "house", name: "خانه", emoji: "⌂", examples: ["بزرگ", "دنج", "روشن", "قدیمی", "آرام"] },
  { id: "night", name: "شب", emoji: "☾", examples: ["تاریک", "آرام", "طولانی", "سرد", "ستاره‌باران"] },
  { id: "child", name: "کودک", emoji: "◡", examples: ["شاد", "کنجکاو", "بازیگوش", "معصوم", "باهوش"] },
  { id: "rain", name: "باران", emoji: "☂", examples: ["شدید", "ملایم", "سیل‌آسا", "پاییزی", "نم‌نم"] },
  { id: "tree", name: "درخت", emoji: "♧", examples: ["بلند", "سبز", "تنومند", "پربار", "کهنسال"] },
  { id: "clothes", name: "لباس", emoji: "◇", examples: ["تمیز", "نو", "زیبا", "رنگارنگ", "گرم"] },
  { id: "fire", name: "آتش", emoji: "♨", examples: ["داغ", "سوزان", "روشن", "خطرناک", "فروزان"] },
  { id: "air", name: "هوا", emoji: "⌇", examples: ["سرد", "گرم", "پاک", "آلوده", "مرطوب"] },
  { id: "mountain", name: "کوه", emoji: "▲", examples: ["بلند", "بزرگ", "سنگی", "سربه‌فلک‌کشیده", "استوار"] },
  { id: "city", name: "شهر", emoji: "▦", examples: ["شلوغ", "بزرگ", "زیبا", "مدرن", "تاریخی"] },
  { id: "room", name: "اتاق", emoji: "□", examples: ["روشن", "تاریک", "بزرگ", "کوچک", "مرتب"] },
  { id: "decision", name: "تصمیم", emoji: "◆", examples: ["دشوار", "مهم", "عاقلانه", "سریع", "قاطع"] },
  { id: "river", name: "رودخانه", emoji: "〰", examples: ["خروشان", "زلال", "پهن", "طولانی", "آرام"] },
  { id: "flower", name: "گل", emoji: "✿", examples: ["زیبا", "خوش‌بو", "تازه", "رنگارنگ", "ظریف"] },
  { id: "movie", name: "فیلم", emoji: "◉", examples: ["جذاب", "ترسناک", "خنده‌دار", "طولانی", "تکان‌دهنده"] }
];

export function promptById(id: string) {
  return adjectivePrompts.find((prompt) => prompt.id === id);
}
