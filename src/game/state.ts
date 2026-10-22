import type { GidaAdi } from "./food";
import { evreIndeksi } from "./growth";

/** Kalıcı ilerleme — kayıt dosyasına yazılan tek şey budur. */
export interface Ilerleme {
  besin: number;
  aclik: number;
  toplamYenen: number;
  yenen: Record<GidaAdi, number>;
  /** Yenen balık sayısı — gıdadan ayrı tutuluyor, HUD'da ayrıca gösteriliyor. */
  yenenBalik: number;
}

export function bosIlerleme(): Ilerleme {
  return {
    besin: 0,
    aclik: 1,
    toplamYenen: 0,
    yenenBalik: 0,
    yenen: {
      plankton: 0,
      yosun: 0,
      karides: 0,
      solucan: 0,
      denizyildizi: 0,
      denizanasi: 0,
    },
  };
}

export function ilerlemeEvresi(ilerleme: Ilerleme): number {
  return evreIndeksi(ilerleme.besin);
}
