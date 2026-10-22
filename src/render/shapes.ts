/** Küçük geometri/renk yardımcıları. */

export type Renk = readonly [number, number, number];

/** Açıyı `merkez` etrafında ±`maks` aralığına sıkıştırır (sarmalama dahil). */
export function aciKisitla(aci: number, merkez: number, maks: number): number {
  let fark = aci - merkez;
  while (fark > Math.PI) fark -= Math.PI * 2;
  while (fark < -Math.PI) fark += Math.PI * 2;
  if (fark > maks) fark = maks;
  else if (fark < -maks) fark = -maks;
  return merkez + fark;
}

/** İki açı arasındaki en kısa farkı döndürür. */
export function aciFarki(a: number, b: number): number {
  let fark = a - b;
  while (fark > Math.PI) fark -= Math.PI * 2;
  while (fark < -Math.PI) fark += Math.PI * 2;
  return fark;
}

/** Normalize edilmiş bir dizi örnekten doğrusal ara değer okur (t: 0..1). */
export function profilOku(profil: readonly number[], t: number): number {
  const n = profil.length;
  if (n === 0) return 0;
  if (n === 1) return profil[0]!;
  const konum = Math.max(0, Math.min(1, t)) * (n - 1);
  const alt = Math.floor(konum);
  const ust = Math.min(n - 1, alt + 1);
  return profil[alt]! + (profil[ust]! - profil[alt]!) * (konum - alt);
}

/** İki rengi karıştırır. */
export function renkKaristir(a: Renk, b: Renk, oran: number): Renk {
  const t = Math.max(0, Math.min(1, oran));
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Renk üçlüsünü Three.js'in beklediği 0..1 aralığına çevirir. */
export function renkNormalize(renk: Renk): [number, number, number] {
  return [renk[0] / 255, renk[1] / 255, renk[2] / 255];
}
