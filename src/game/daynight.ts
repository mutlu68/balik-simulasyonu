import type { Renk } from "../render/shapes";
import { renkKaristir } from "../render/shapes";

/**
 * Gündüz–gece döngüsü.
 *
 * Tam tur ~5 dakika. Işık yalnızca "karartma" değil: renk sıcaklığı da kayıyor —
 * öğlen berrak turkuaz, alacakaranlıkta yeşilimsi, gece lacivert. Balıkların ve
 * planktonun davranışı da bu değere bağlı, yani döngü sadece görsel değil.
 */

const TUR_SURESI = 300;

export interface IsikDurumu {
  /** 0 = gece yarısı, 1 = öğlen. */
  readonly gunduzOrani: number;
  /** Sprite ve dekor renklerinin çarpanı. */
  readonly ortamIsigi: number;
  /** Yüzey ve dip su renkleri (derinlik gradyanı bunların arasında). */
  readonly yuzeyRengi: Renk;
  readonly dipRengi: Renk;
  /** Işık huzmelerinin ve caustic'in görünürlüğü. */
  readonly huzmeGucu: number;
  /** 0..24 saat — HUD'da gösteriliyor. */
  readonly saat: number;
  readonly geceMi: boolean;
}

const GUNDUZ_YUZEY: Renk = [86, 196, 214];
const GUNDUZ_DIP: Renk = [10, 52, 88];
const ALACAKARANLIK_YUZEY: Renk = [72, 138, 150];
const ALACAKARANLIK_DIP: Renk = [10, 40, 66];
const GECE_YUZEY: Renk = [24, 54, 88];
const GECE_DIP: Renk = [5, 16, 34];

export function isikHesapla(zaman: number): IsikDurumu {
  // Saat 6'da doğar, 18'de batar; döngü sinüs değil de yumuşatılmış eşik olsun diye
  // sinüsü biraz keskinleştiriyoruz — gündüz ve gece "düzlük", geçişler kısa.
  const faz = ((zaman % TUR_SURESI) / TUR_SURESI + 0.25) % 1;
  const saat = faz * 24;
  const ham = Math.sin(faz * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
  const gunduzOrani = Math.max(0, Math.min(1, (ham - 0.12) / 0.76));

  const geceMi = gunduzOrani < 0.3;

  // Renk: gece → alacakaranlık → gündüz, iki aşamalı karışım.
  const yuzeyRengi =
    gunduzOrani < 0.5
      ? renkKaristir(GECE_YUZEY, ALACAKARANLIK_YUZEY, gunduzOrani * 2)
      : renkKaristir(ALACAKARANLIK_YUZEY, GUNDUZ_YUZEY, (gunduzOrani - 0.5) * 2);
  const dipRengi =
    gunduzOrani < 0.5
      ? renkKaristir(GECE_DIP, ALACAKARANLIK_DIP, gunduzOrani * 2)
      : renkKaristir(ALACAKARANLIK_DIP, GUNDUZ_DIP, (gunduzOrani - 0.5) * 2);

  return {
    gunduzOrani,
    // Gece tamamen karanlık olmuyor: ay ışığı payı bırakıyoruz, yoksa oyun oynanamaz.
    ortamIsigi: 0.42 + gunduzOrani * 0.58,
    yuzeyRengi,
    dipRengi,
    huzmeGucu: Math.pow(gunduzOrani, 1.6),
    saat,
    geceMi,
  };
}

export function saatMetni(saat: number): string {
  const s = Math.floor(saat);
  const d = Math.floor((saat - s) * 60);
  return `${String(s).padStart(2, "0")}:${String(d).padStart(2, "0")}`;
}
