import type { Metadata } from "next";
import { animalPhotoCredits } from "@/lib/data/animal-photos";
export const metadata: Metadata = { title: "عکاس‌ها و منابع تصاویر حیوان‌جو" };
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
export default function AnimalPhotoSources() {
  return <main className="shell animal-sources">
    <a className="animal-source-back" href={base + "/"}>→ بازگشت به بازی</a>
    <h1>عکس‌های حیوان‌جو</h1>
    <p>این تصاویر از ویکی‌انبار گرفته شده‌اند. نام عکاس و مجوز هر عکس در ادامه آمده است؛ برای اطلاعات کامل، صفحهٔ منبع را ببین.</p>
    <div className="animal-sources-grid">{animalPhotoCredits.map(photo => <article id={photo.animalId} key={photo.animalId}>
      <img src={base + photo.small.src} alt={photo.name} width={80} height={80} loading="lazy" decoding="async" />
      <div><h2>{photo.name}</h2><p>عکاس: <span dir="auto">{photo.artist}</span></p>
        <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">صفحهٔ اصلی عکس</a><span> · </span>
        {photo.licenseUrl ? <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer" dir="ltr">{photo.license}</a> : <span dir="ltr">{photo.license}</span>}
      </div>
    </article>)}</div>
  </main>;
}
