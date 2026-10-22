import { YUKSEKLIK } from "../core/dunya";

/**
 * Akıntı alanı.
 *
 * Birkaç farklı dalga boyundaki sinüsün toplamı: yavaş değişen, tekrar etmiyormuş gibi
 * duran bir vektör alanı. Parçacıkları, gıdayı ve çayır yapraklarını sürükler,
 * balıkları hafifçe iter.
 *
 * Sahnenin "hava değil su" hissini taşıyan asıl şey bu: her şey aynı görünmez akışta
 * birlikte kaydığında hareket su altı hareketi gibi okunuyor.
 */

export interface AkintiVektoru {
  x: number;
  y: number;
  z: number;
}

/** Yüzeye yakın akıntı daha güçlü, dipte sürtünmeden dolayı zayıf. */
function derinlikZayiflamasi(y: number): number {
  const t = Math.max(0, Math.min(1, y / YUKSEKLIK));
  return 0.35 + (1 - t) * 0.65;
}

export function akinti(
  x: number,
  y: number,
  z: number,
  zaman: number,
  hedef: AkintiVektoru,
): AkintiVektoru {
  const zayifla = derinlikZayiflamasi(y);

  hedef.x =
    (Math.sin(y * 0.012 + zaman * 0.11) * 5.5 +
      Math.sin(z * 0.006 - zaman * 0.07) * 3.2 +
      Math.sin((x + z) * 0.019 + zaman * 0.23) * 1.4) *
    zayifla;

  // Dikey bileşen çok daha zayıf — su kütlesi yatay hareket eder.
  hedef.y =
    (Math.sin(x * 0.009 - zaman * 0.13) * 1.8 +
      Math.sin((x - z) * 0.015 + zaman * 0.17) * 0.9) *
    zayifla;

  hedef.z =
    (Math.sin(x * 0.0105 + zaman * 0.09) * 4.4 +
      Math.sin(y * 0.014 - zaman * 0.15) * 2.1) *
    zayifla;

  return hedef;
}

/** Sahne genelinde hissedilen ortalama akıntı — çayır eğilimi için. */
export function genelAkinti(zaman: number): number {
  return Math.sin(zaman * 0.09) * 0.7 + Math.sin(zaman * 0.031 + 1.4) * 0.3;
}
