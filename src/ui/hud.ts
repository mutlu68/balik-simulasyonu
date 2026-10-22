import type { IsikDurumu } from "../game/daynight";
import { saatMetni } from "../game/daynight";
import { siradakiKilit } from "../game/food";
import { EVRELER, SON_EVRE, evreIlerlemesi, evreIndeksi } from "../game/growth";
import type { Ilerleme } from "../game/state";

/**
 * HUD artık canvas'a değil **DOM'a** çiziliyor.
 *
 * 3B'de canvas WebGL'e ait; üstüne yazı çizmek ayrı bir 2B katman gerektirirdi.
 * DOM katmanı hem daha keskin (tarayıcının kendi yazı tipi işlemesi) hem daha basit.
 * Her karede DOM'a yazmamak için değerler yalnızca değiştiğinde güncelleniyor.
 */

export interface HudDurumu {
  duyuru: string;
  duyuruSuresi: number;
  /** Yeme anında 1'e çekilip sönen vurgu — tokluk çubuğunu parlatıyor. */
  yemeVurgusu: number;
}

interface Ogeler {
  readonly evre: HTMLElement;
  readonly buyumeCubuk: HTMLElement;
  readonly buyumeNot: HTMLElement;
  readonly toklukCubuk: HTMLElement;
  readonly toklukNot: HTMLElement;
  readonly saat: HTMLElement;
  readonly sayaclar: HTMLElement;
  readonly kilit: HTMLElement;
  readonly duyuru: HTMLElement;
}

let ogeler: Ogeler | null = null;
let sonMetin: Record<string, string> = {};

export function hudOlustur(): HudDurumu {
  return { duyuru: "", duyuruSuresi: 0, yemeVurgusu: 0 };
}

/**
 * Bir şey yendiğini HUD'da görünür kılar.
 *
 * Tokluk çubuğunun genişlemesi tek başına fark edilmiyordu: yem küçükken artış
 * bir iki piksel oluyor ve göz zaten balığa bakıyor.
 */
export function yemeVurgusuGoster(hud: HudDurumu): void {
  hud.yemeVurgusu = 1;
}

export function duyuruGoster(hud: HudDurumu, metin: string): void {
  hud.duyuru = metin;
  hud.duyuruSuresi = 2.8;
}

export function hudGuncelle(hud: HudDurumu, dt: number): void {
  if (hud.duyuruSuresi > 0) hud.duyuruSuresi = Math.max(0, hud.duyuruSuresi - dt);
  if (hud.yemeVurgusu > 0) hud.yemeVurgusu = Math.max(0, hud.yemeVurgusu - dt / 0.45);
}

function bul(id: string): HTMLElement {
  const oge = document.getElementById(id);
  if (!oge) throw new Error(`HUD ögesi bulunamadı: ${id}`);
  return oge;
}

function ogeleriBagla(): Ogeler {
  if (ogeler) return ogeler;
  ogeler = {
    evre: bul("hud-evre"),
    buyumeCubuk: bul("hud-buyume-dolgu"),
    buyumeNot: bul("hud-buyume-not"),
    toklukCubuk: bul("hud-tokluk-dolgu"),
    toklukNot: bul("hud-tokluk-not"),
    saat: bul("hud-saat"),
    sayaclar: bul("hud-sayaclar"),
    kilit: bul("hud-kilit"),
    duyuru: bul("hud-duyuru"),
  };
  return ogeler;
}

/** DOM yazımı pahalı; yalnızca değişen metni güncelliyoruz. */
function metinAyarla(oge: HTMLElement, anahtar: string, metin: string): void {
  if (sonMetin[anahtar] === metin) return;
  sonMetin[anahtar] = metin;
  oge.textContent = metin;
}

export function hudCiz(hud: HudDurumu, ilerleme: Ilerleme, isik: IsikDurumu): void {
  const o = ogeleriBagla();
  const evre = evreIndeksi(ilerleme.besin);

  metinAyarla(o.evre, "evre", `Çipura · ${EVRELER[evre]!.ad}`);
  o.buyumeCubuk.style.width = `${(evreIlerlemesi(ilerleme.besin) * 100).toFixed(1)}%`;

  if (evre < SON_EVRE) {
    const kalan = Math.max(0, Math.ceil(EVRELER[evre + 1]!.esik - ilerleme.besin));
    metinAyarla(o.buyumeNot, "buyumeNot", `${kalan} besin sonra ${EVRELER[evre + 1]!.ad}`);
  } else {
    metinAyarla(o.buyumeNot, "buyumeNot", "en büyük boy");
  }

  const aclik = ilerleme.aclik;
  o.toklukCubuk.style.width = `${(aclik * 100).toFixed(1)}%`;

  // Yeme vurgusu: çubuk parlayıp sönüyor, sayaç da onunla birlikte.
  const vurgu = hud.yemeVurgusu;
  o.toklukCubuk.style.filter = vurgu > 0 ? `brightness(${1 + vurgu * 0.85})` : "";
  o.toklukCubuk.style.boxShadow =
    vurgu > 0 ? `0 0 ${(vurgu * 10).toFixed(1)}px rgba(150, 240, 175, ${vurgu.toFixed(2)})` : "";
  o.sayaclar.style.color = vurgu > 0 ? `rgba(226, 244, 255, ${(0.55 + vurgu * 0.45).toFixed(2)})` : "";
  o.toklukCubuk.style.background =
    aclik > 0.3
      ? "linear-gradient(180deg, #84d694, #3c9654)"
      : aclik > 0.12
        ? "linear-gradient(180deg, #ffd476, #ba8c20)"
        : "linear-gradient(180deg, #ff927c, #b04434)";
  metinAyarla(o.toklukNot, "toklukNot", aclik <= 0 ? "acıktın — yemek ara" : "tokluk");

  metinAyarla(o.saat, "saat", `${saatMetni(isik.saat)} · ${isik.geceMi ? "gece" : "gündüz"}`);
  const balikNotu = ilerleme.yenenBalik > 0 ? ` · balık ${ilerleme.yenenBalik}` : "";
  metinAyarla(
    o.sayaclar,
    "sayaclar",
    `besin ${Math.floor(ilerleme.besin)} · yenen ${ilerleme.toplamYenen}${balikNotu}`,
  );

  const kilit = siradakiKilit(evre);
  metinAyarla(
    o.kilit,
    "kilit",
    kilit ? `${kilit.etiket} · ${EVRELER[kilit.minEvre]!.ad} evresinde açılır` : "",
  );

  if (hud.duyuruSuresi > 0) {
    metinAyarla(o.duyuru, "duyuru", hud.duyuru);
    o.duyuru.style.opacity = String(Math.min(1, hud.duyuruSuresi / 0.7));
  } else if (o.duyuru.style.opacity !== "0") {
    o.duyuru.style.opacity = "0";
  }
}

/** Sıfırlamada önbelleği temizle, yoksa eski metinler ekranda kalır. */
export function hudSifirla(): void {
  sonMetin = {};
}
