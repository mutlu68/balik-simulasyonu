import { GENISLIK, Z_GENISLIK, dipCizgisi, kumYuksekligi } from "../core/dunya";
import type { Gida, GidaAdi } from "./food";
import { enYakinGida } from "./food";
import type { Tur } from "./species";
import { TURLER } from "./species";

/**
 * Sürü davranışı: klasik boids (ayrışma / hizalanma / toplanma) üstüne su altına
 * özgü kuvvetler. 2B sürümden birebir taşındı, tek fark üçüncü eksen.
 *
 * Sürü kuralları yalnızca **aynı tür** bireyler arasında işler — hamsi sürüsü levreği
 * kendinden saymaz. Gerçek bir balık sürüsünün okunaklı görünmesinin sebebi budur.
 * Ayrışma ise her türle işler, yoksa balıklar birbirinin içinden geçer.
 *
 * **Komşu listesi dışarıdan geliyor.** Eskiden burada bütün popülasyon taranıyordu;
 * resif büyüyüp nüfus 215'e çıkınca O(n²) maliyeti kare bütçesinin yarısını yedi.
 * Artık `npcFish.ts` uzamsal ızgaradan (`core/izgara.ts`) aday listesi çıkarıp veriyor,
 * buradaki döngü yalnızca kesin mesafe kontrolünü yapıyor. Aynısı yem araması için de
 * geçerli: `gidaAdaylari` zaten kabaca elenmiş durumda.
 */

export interface SuruBirey {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  readonly tur: Tur;
  boy: number;
  /** Gezinme kuvvetlerinin yavaşça dönen yönleri. */
  gezinmeAci: number;
  gezinmeEgim: number;
  /** Bu bireyin tercih ettiği derinlik (tür bandı içinde sabit bir yer). */
  tercihDerinlik: number;
  /** Peşine düştüğü gıda. */
  hedefGida: Gida | null;
}

export interface Ortam {
  readonly oyuncuX: number;
  readonly oyuncuY: number;
  readonly oyuncuZ: number;
  readonly oyuncuBoyu: number;
  /** 0 = gece, 1 = tam gündüz. */
  readonly gunduzOrani: number;
  readonly akintiX: number;
  readonly akintiY: number;
  readonly akintiZ: number;
}

const AYRISMA_MESAFESI = 1.9;
const HIZALANMA_MESAFESI = 5.5;
const TOPLANMA_MESAFESI = 7.5;

/** Yem arama menzili boyun katı. */
const YEM_MENZILI = 7;

/** Resifteki en büyük balık (orkinos 140) — ızgara sorgusunun alt sınırı buna bağlı. */
const EN_BUYUK_BOY = TURLER.reduce((enBuyuk, tur) => Math.max(enBuyuk, tur.boy[1]), 0);

/**
 * Bir bireyin komşu sorgusu için gereken yarıçap.
 *
 * Toplanma menzili boyla ölçekleniyor, ama ayrışma **her türle** işlediği için küçük
 * bir balığın kendinden çok daha büyük bir komşuyu da görmesi gerekiyor: çarpışma
 * yarıçapı `(boy + digeri.boy) / 2`. İki değerin büyüğü alınmazsa hamsi orkinosu fark
 * etmiyor ve içinden geçiyor.
 */
export function komsuYaricapi(boy: number): number {
  return Math.max(boy * TOPLANMA_MESAFESI, (boy + EN_BUYUK_BOY) * 0.5);
}

/** Bir bireyin yem sorgusu için gereken yarıçap. */
export function yemYaricapi(boy: number): number {
  return boy * YEM_MENZILI;
}

/**
 * Türün o anki etkinliği: gündüzcüler gece uyuşur, gececiler gündüz.
 * Uyuşuk balık yavaşlar ve dibe çekilir — sahne gece gerçekten sakinleşiyor.
 */
export function etkinlik(tur: Tur, gunduzOrani: number): number {
  const uyanik = tur.gececi ? 1 - gunduzOrani : gunduzOrani;
  return 0.35 + uyanik * 0.65;
}

export interface Kuvvet {
  x: number;
  y: number;
  z: number;
}

/**
 * Bir bireyin bu karedeki ivmesini hesaplar.
 *
 * `komsular` ve `gidaAdaylari` uzamsal ızgaradan gelen **aday** listelerdir: kaba
 * eleme yapılmış, kesin mesafe kontrolü burada. Bireyin kendisi de komşu listesinde
 * olabilir, atlanıyor.
 */
export function kuvvetHesapla(
  birey: SuruBirey,
  komsular: readonly SuruBirey[],
  gidaAdaylari: readonly Gida[],
  ortam: Ortam,
  dt: number,
  kuvvet: Kuvvet,
): Kuvvet {
  const tur = birey.tur;
  const boy = birey.boy;
  kuvvet.x = 0;
  kuvvet.y = 0;
  kuvvet.z = 0;

  // --- Sürü kuvvetleri ---
  let ayrismaX = 0;
  let ayrismaY = 0;
  let ayrismaZ = 0;
  let hizVx = 0;
  let hizVy = 0;
  let hizVz = 0;
  let merkezX = 0;
  let merkezY = 0;
  let merkezZ = 0;
  let hizalananSayi = 0;
  let toplananSayi = 0;

  const ayrismaR = boy * AYRISMA_MESAFESI;
  const hizalanmaR = boy * HIZALANMA_MESAFESI;
  const toplanmaR = boy * TOPLANMA_MESAFESI;

  for (const digeri of komsular) {
    if (digeri === birey) continue;
    const dx = birey.x - digeri.x;
    const dy = birey.y - digeri.y;
    const dz = birey.z - digeri.z;
    const kare = dx * dx + dy * dy + dz * dz;
    if (kare < 0.01) continue;

    // Ayrışma her türle işler: farklı türler de birbirinin içinden geçmemeli.
    const carpismaR = (boy + digeri.boy) * 0.5;
    if (kare < carpismaR * carpismaR) {
      const mesafe = Math.sqrt(kare);
      const guc = (1 - mesafe / carpismaR) / mesafe;
      ayrismaX += dx * guc;
      ayrismaY += dy * guc;
      ayrismaZ += dz * guc;
    }

    if (digeri.tur !== tur) continue;

    if (kare < ayrismaR * ayrismaR) {
      const mesafe = Math.sqrt(kare);
      const guc = ((1 - mesafe / ayrismaR) * 0.8) / mesafe;
      ayrismaX += dx * guc;
      ayrismaY += dy * guc;
      ayrismaZ += dz * guc;
    }
    if (kare < hizalanmaR * hizalanmaR) {
      hizVx += digeri.vx;
      hizVy += digeri.vy;
      hizVz += digeri.vz;
      hizalananSayi++;
    }
    if (kare < toplanmaR * toplanmaR) {
      merkezX += digeri.x;
      merkezY += digeri.y;
      merkezZ += digeri.z;
      toplananSayi++;
    }
  }

  const suru = tur.suruEgilimi;
  kuvvet.x += ayrismaX * 90;
  kuvvet.y += ayrismaY * 90;
  kuvvet.z += ayrismaZ * 90;

  if (hizalananSayi > 0 && suru > 0) {
    kuvvet.x += (hizVx / hizalananSayi - birey.vx) * 1.6 * suru;
    kuvvet.y += (hizVy / hizalananSayi - birey.vy) * 1.6 * suru;
    kuvvet.z += (hizVz / hizalananSayi - birey.vz) * 1.6 * suru;
  }
  if (toplananSayi > 0 && suru > 0) {
    kuvvet.x += (merkezX / toplananSayi - birey.x) * 0.9 * suru;
    kuvvet.y += (merkezY / toplananSayi - birey.y) * 0.9 * suru;
    kuvvet.z += (merkezZ / toplananSayi - birey.z) * 0.9 * suru;
  }

  // --- Gezinme: yavaşça dönen bir yön. Sürü olmasa da balık donuk durmasın. ---
  birey.gezinmeAci += (Math.random() - 0.5) * 2.4 * dt;
  birey.gezinmeEgim += (Math.random() - 0.5) * 1.2 * dt;
  birey.gezinmeEgim = Math.max(-0.6, Math.min(0.6, birey.gezinmeEgim));
  const gezinmeGucu = 16 * (1 - suru * 0.5);
  kuvvet.x += Math.cos(birey.gezinmeAci) * gezinmeGucu;
  kuvvet.z += Math.sin(birey.gezinmeAci) * gezinmeGucu;
  kuvvet.y += birey.gezinmeEgim * gezinmeGucu * 0.4;

  // --- Oyuncudan ürkme ---
  if (tur.urkeklik > 0.01) {
    const dx = birey.x - ortam.oyuncuX;
    const dy = birey.y - ortam.oyuncuY;
    const dz = birey.z - ortam.oyuncuZ;
    const mesafe = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // Büyük oyuncu daha uzaktan ürkütür; ürkeklik türden geliyor.
    const esik = (ortam.oyuncuBoyu * 1.6 + boy * 3) * (0.4 + tur.urkeklik);
    if (mesafe < esik && mesafe > 0.01) {
      const guc = ((1 - mesafe / esik) * 260 * tur.urkeklik) / mesafe;
      kuvvet.x += dx * guc;
      kuvvet.y += dy * guc;
      kuvvet.z += dz * guc;
    }
  }

  // --- Derinlik tercihi ---
  const dip = dipCizgisi();
  const kum = kumYuksekligi(birey.x, birey.z);
  const hedefY = tur.dipBalig ? kum - boy * 0.6 : birey.tercihDerinlik * dip;
  // Gece gündüzcüler dibe çekilir (dinlenme).
  const uyusukluk = 1 - etkinlik(tur, ortam.gunduzOrani);
  const dinlenmeY = hedefY + uyusukluk * (kum - boy - hedefY) * 0.7;
  kuvvet.y += (dinlenmeY - birey.y) * (tur.dipBalig ? 3.2 : 1.1);

  // --- Zemin ve yüzeyden kaçınma ---
  const zemin = kum - boy * 0.35;
  if (birey.y > zemin) kuvvet.y -= (birey.y - zemin) * 14;
  if (birey.y < 12) kuvvet.y += (12 - birey.y) * 14;

  // --- Yem arama ---
  birey.hedefGida = null;
  if (!tur.dipBalig || Math.random() < 0.5) {
    const gida = enYakinGida(
      gidaAdaylari,
      birey.x,
      birey.y,
      birey.z,
      yemYaricapi(boy),
      tur.diyet as readonly GidaAdi[],
    );
    if (gida) {
      birey.hedefGida = gida;
      const dx = gida.x - birey.x;
      const dy = gida.y - birey.y;
      const dz = gida.z - birey.z;
      const mesafe = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const guc = 55 / mesafe;
      kuvvet.x += dx * guc;
      kuvvet.y += dy * guc;
      kuvvet.z += dz * guc;
    }
  }

  // --- Akıntı: su kütlesi balığı da taşır ---
  kuvvet.x += ortam.akintiX * 1.2;
  kuvvet.y += ortam.akintiY * 1.2;
  kuvvet.z += ortam.akintiZ * 1.2;

  // --- Resif sınırları: kenara yaklaşınca içeri döndür ---
  const kenar = 40;
  if (birey.x < kenar) kuvvet.x += (kenar - birey.x) * 2.2;
  if (birey.x > GENISLIK - kenar) kuvvet.x -= (birey.x - (GENISLIK - kenar)) * 2.2;
  if (birey.z < kenar) kuvvet.z += (kenar - birey.z) * 2.2;
  if (birey.z > Z_GENISLIK - kenar) kuvvet.z -= (birey.z - (Z_GENISLIK - kenar)) * 2.2;

  return kuvvet;
}

/** Hızı türün rahat hızıyla sınırlar (etkinliğe göre azalır). */
export function hiziSinirla(birey: SuruBirey, gunduzOrani: number): void {
  const maks = birey.tur.hiz * etkinlik(birey.tur, gunduzOrani);
  const hiz = Math.sqrt(birey.vx * birey.vx + birey.vy * birey.vy + birey.vz * birey.vz);
  if (hiz > maks) {
    const oran = maks / hiz;
    birey.vx *= oran;
    birey.vy *= oran;
    birey.vz *= oran;
  }
}
