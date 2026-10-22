/**
 * Büyüme ve açlık kuralları.
 *
 * Sakin simülasyon: ölüm yok. Açlık boşalırsa balık büyümeyi durdurur ve çok yavaş
 * küçülür, ama ulaştığı evrenin altına asla düşmez.
 *
 * Evre adları çipuranın gerçek yaşam evrelerine karşılık geliyor; boy dünya birimi
 * (sahne yüksekliği 300 birim) — ölçek çarpanı değil, doğrudan balığın uzunluğu.
 */

export interface Evre {
  readonly ad: string;
  /** Bu evreye geçmek için gereken toplam besin. */
  readonly esik: number;
  /** Burun–kuyruk uzunluğu (dünya birimi). */
  readonly boy: number;
}

export const EVRELER: readonly Evre[] = [
  { ad: "Yavru", esik: 0, boy: 13 },
  { ad: "Parmak", esik: 40, boy: 19 },
  { ad: "Genç", esik: 120, boy: 27 },
  { ad: "Erişkin", esik: 280, boy: 37 },
  { ad: "Koca", esik: 550, boy: 48 },
];

export const SON_EVRE = EVRELER.length - 1;

/** Açlık çubuğu saniyede bu kadar azalır (tam dolu ~2 dakikada boşalır). */
const ACLIK_HIZI = 1 / 130;
/** Açlık boşken saniyede kaybedilen besin. */
const ACLIK_BESIN_KAYBI = 2;

export function evreIndeksi(besin: number): number {
  let indeks = 0;
  for (let i = 0; i < EVRELER.length; i++) {
    if (besin >= EVRELER[i]!.esik) indeks = i;
  }
  return indeks;
}

/** Bir sonraki evreye ilerleme oranı (0-1). Son evrede her zaman 1. */
export function evreIlerlemesi(besin: number): number {
  const indeks = evreIndeksi(besin);
  if (indeks >= SON_EVRE) return 1;
  const alt = EVRELER[indeks]!.esik;
  const ust = EVRELER[indeks + 1]!.esik;
  return Math.max(0, Math.min(1, (besin - alt) / (ust - alt)));
}

export function evreBoyu(indeks: number): number {
  return EVRELER[Math.max(0, Math.min(SON_EVRE, indeks))]!.boy;
}

/** Bir gıdanın açlık çubuğuna katkısı — büyük gıda daha çok doyurur, ama tavanlı. */
export function aclikKatkisi(besin: number): number {
  return Math.min(0.3, 0.02 + besin * 0.018);
}

export interface AclikSonucu {
  readonly aclik: number;
  readonly besin: number;
}

/** Açlığı ve (boşsa) besin erimesini işler. Besin, mevcut evrenin eşiğinin altına inmez. */
export function aclikGuncelle(aclik: number, besin: number, dt: number): AclikSonucu {
  const yeniAclik = Math.max(0, aclik - ACLIK_HIZI * dt);
  if (yeniAclik > 0) return { aclik: yeniAclik, besin };

  const taban = EVRELER[evreIndeksi(besin)]!.esik;
  const yeniBesin = Math.max(taban, besin - ACLIK_BESIN_KAYBI * dt);
  return { aclik: yeniAclik, besin: yeniBesin };
}
