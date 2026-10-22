/** Rastgelelik yardımcıları. Dekor gibi sabit kalması gereken yerler için tohumlanabilir. */

export function aralik(min: number, maks: number): number {
  return min + Math.random() * (maks - min);
}

export function tamAralik(min: number, maks: number): number {
  return Math.floor(aralik(min, maks + 1));
}

export function sec<T>(dizi: readonly T[]): T {
  const eleman = dizi[Math.floor(Math.random() * dizi.length)];
  if (eleman === undefined) throw new Error("Boş diziden seçim yapılamaz.");
  return eleman;
}

export function sans(olasilik: number): boolean {
  return Math.random() < olasilik;
}

/** Deterministik akış (mulberry32) — dekorun her açılışta aynı olması için. */
export function tohumluRng(tohum: number): () => number {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function karistir(deger: number, hedef: number, oran: number): number {
  return deger + (hedef - deger) * oran;
}

export function kis(deger: number, min: number, maks: number): number {
  return Math.max(min, Math.min(maks, deger));
}
