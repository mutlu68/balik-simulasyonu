import type { Ilerleme } from "./state";
import { bosIlerleme } from "./state";

const ANAHTAR = "balik-simulasyonu/ilerleme/v1";

/**
 * localStorage bazı ortamlarda (gizli sekme, kapatılmış site verisi) okuma/yazmada
 * hata fırlatır. Kayıt oyunun çalışması için şart değil — her erişim korumalı.
 */
export function ilerlemeYukle(): Ilerleme {
  const varsayilan = bosIlerleme();
  try {
    const ham = localStorage.getItem(ANAHTAR);
    if (!ham) return varsayilan;
    const veri = JSON.parse(ham) as Partial<Ilerleme>;
    return {
      besin: sayi(veri.besin, 0),
      aclik: Math.max(0, Math.min(1, sayi(veri.aclik, 1))),
      toplamYenen: sayi(veri.toplamYenen, 0),
      yenenBalik: sayi(veri.yenenBalik, 0),
      yenen: { ...varsayilan.yenen, ...(veri.yenen ?? {}) },
    };
  } catch {
    return varsayilan;
  }
}

export function ilerlemeKaydet(ilerleme: Ilerleme): void {
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify(ilerleme));
  } catch {
    /* kayıt yapılamıyorsa oyun yine de oynanabilir */
  }
}

export function ilerlemeSil(): void {
  try {
    localStorage.removeItem(ANAHTAR);
  } catch {
    /* yoksay */
  }
}

function sayi(deger: unknown, varsayilan: number): number {
  return typeof deger === "number" && Number.isFinite(deger) ? deger : varsayilan;
}
