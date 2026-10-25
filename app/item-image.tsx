"use client";
import { useState } from "react";
import type { ItemPhoto } from "@/lib/item-photo";
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
type Item = { id?: string; name?: string; emoji?: string; photo?: ItemPhoto };

export function ItemImage({ item }: { item: Item }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!item.photo || failed === item.photo.src) return <span aria-hidden="true">{item.emoji}</span>;
  return <img className="animal-thumbnail" src={base + item.photo.src} width={48} height={48}
    alt="" loading="lazy" decoding="async" onError={() => setFailed(item.photo!.src)} />;
}

export function AnimalPortrait({ item }: { item: Item | null | undefined }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!item?.photo || failed === item.photo.largeSrc) return null;
  return <figure className="animal-portrait">
    <img src={base + item.photo.largeSrc} alt={`عکس ${item.name || "حیوان"}`} loading="lazy" decoding="async"
      onError={() => setFailed(item.photo!.largeSrc)} />
    <figcaption><a href={`${base}/animal-photos${item.id ? "#" + item.id : ""}`} target="_blank" rel="noopener noreferrer">عکاس و منبع عکس ↗</a></figcaption>
  </figure>;
}

export function AnimalPhotoCreditsLink() {
  return <p className="animal-photo-credits"><a href={base + "/animal-photos"} target="_blank" rel="noopener noreferrer">عکس‌ها: ویکی‌انبار · عکاس‌ها و مجوزها ↗</a></p>;
}
