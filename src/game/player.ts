import { Vector3 } from "three";
import type { Girdi } from "../core/input";
import { GENISLIK, YUKSEKLIK, Z_GENISLIK, kumYuksekligi, sinirla } from "../core/dunya";
import type { Govde } from "../render/fish3d";
import { agizNoktasi as govdeAgzi, govdeGuncelle, govdeOlustur } from "../render/fish3d";
import { evreBoyu } from "./growth";
import { oyuncuGorunumu } from "./species";

/**
 * Oyuncu balığının hareketi.
 *
 * Yönelim **fareden**, itki klavyeden gelir: fare burnu çevirir (yon + egim), W/S
 * balığı baktığı yönde sürer, A/D yana kaydırır, Q/E dünya dikeyinde ek itki verir.
 * Dikey itkinin ayrı tutulması bilinçli — dar bir yerde burnu çevirmeden dikine
 * yükselmek gerekiyor.
 */

/** Yüzeyden bu kadar uzak durur — balık suyun dışına çıkmaz. */
const KENAR_PAYI = 10;

/** Fare hassasiyeti: radyan / piksel. FPS oyunlarının alışılmış aralığında. */
const FARE_HASSASIYETI = 0.0028;

/**
 * Burun en fazla bu kadar dikleşir (~78°). Tam 90°'de yatay bileşen sıfırlanıp
 * dönüş yönü belirsizleşiyor; biraz altında kalmak bunu engelliyor.
 */
const MAKS_EGIM = 1.36;

/** Serbest bakışta kameranın dikeyde gidebileceği en uç açı (~69°). */
const MAKS_SERBEST_EGIM = 1.2;

/** Sağ tuş bırakılınca kameranın arkaya süzülme hızı (1/sn). */
const SERBEST_SONUM = 5;

/** Açıyı [-π, π] aralığına sarar — kamera arkaya en kısa yoldan dönsün diye. */
function aciSar(a: number): number {
  const tam = Math.PI * 2;
  let s = (a + Math.PI) % tam;
  if (s < 0) s += tam;
  return s - Math.PI;
}

export interface Oyuncu {
  x: number;
  y: number;
  z: number;
  /** Yatay bakış açısı (radyan) — fareyle sürülür. */
  yon: number;
  /** Dikey bakış açısı (radyan; negatif = yüzeye, pozitif = dibe) — fareyle sürülür. */
  egim: number;
  /** Bakılan yöndeki hız. */
  hiz: number;
  /** Yana kayma hızı (sağ pozitif). */
  yanHiz: number;
  /** Dünya dikeyindeki ek itki (negatif = yüzeye, pozitif = dibe). */
  dikeyHiz: number;
  /** Serbest bakışta kameranın balığa göre yatay sapması (radyan). */
  serbestYaw: number;
  /** Serbest bakışta kameranın balığa göre dikey sapması (radyan). */
  serbestPitch: number;
  /**
   * Kameranın baktığı yön. Serbest bakış yokken `ileri` ile aynı; sağ tuş basılıyken
   * balıktan ayrılır. Çizim `ileri`yi, kamera bunu kullanıyor.
   */
  readonly kameraIleri: Vector3;
  govde: Govde;
  evre: number;
  readonly ileri: Vector3;
}

export function oyuncuOlustur(evre: number): Oyuncu {
  const boy = evreBoyu(evre);
  const x = GENISLIK / 2;
  const y = YUKSEKLIK * 0.45;
  const z = Z_GENISLIK / 2;
  return {
    x,
    y,
    z,
    yon: 0,
    egim: 0,
    hiz: 0,
    yanHiz: 0,
    dikeyHiz: 0,
    serbestYaw: 0,
    serbestPitch: 0,
    kameraIleri: new Vector3(1, 0, 0),
    govde: govdeOlustur(oyuncuGorunumu(evre), boy, x, y, z, 0),
    evre,
    ileri: new Vector3(1, 0, 0),
  };
}

/**
 * Evre büyüdükçe balık ağırlaşır: üst hız artar, ivmelenme ve klavye dönüşü azalır.
 * Büyük bir balığın hantallaşması büyümenin hissedilmesini sağlıyor. Fare dönüşü
 * bilerek evreden bağımsız — nişan alma hissinin evre değiştikçe kayması rahatsız edici.
 */
function hareketAyarlari(evre: number): {
  maksHiz: number;
  ivme: number;
  donusHizi: number;
  maksDikeyHiz: number;
} {
  return {
    maksHiz: 46 + evre * 6,
    ivme: 2.6 - evre * 0.18,
    donusHizi: 2.0 - evre * 0.22,
    // Yatay üst hızın ~%60'ı: dikey kaçış mümkün ama yüzmenin yerini almıyor.
    maksDikeyHiz: 28 + evre * 3.5,
  };
}

/** Yatay düzlemde sağ yön — yana kayma bunu kullanır (eğimden etkilenmez). */
const _sag = new Vector3();

export function oyuncuGuncelle(o: Oyuncu, girdi: Girdi, dt: number): void {
  const { maksHiz, ivme, donusHizi, maksDikeyHiz } = hareketAyarlari(o.evre);

  // --- Yönelim: fare + ok tuşu yedeği ---------------------------------------
  const bakis = girdi.bakisiTuket();

  if (girdi.serbestBakis) {
    // Sağ tuş basılı: delta kameraya gider, balık yönünü korur.
    o.serbestYaw = aciSar(o.serbestYaw + bakis.x * FARE_HASSASIYETI);
    o.serbestPitch = sinirla(
      o.serbestPitch + bakis.y * FARE_HASSASIYETI,
      -MAKS_SERBEST_EGIM,
      MAKS_SERBEST_EGIM,
    );
  } else {
    o.yon += bakis.x * FARE_HASSASIYETI;
    o.egim += bakis.y * FARE_HASSASIYETI;
    // Tuş bırakılınca kamera arkaya süzülür — ani geri dönüş baş döndürüyor.
    const sonum = 1 - Math.exp(-SERBEST_SONUM * dt);
    o.serbestYaw -= o.serbestYaw * sonum;
    o.serbestPitch -= o.serbestPitch * sonum;
  }

  o.yon += girdi.donus * donusHizi * dt;
  o.egim = sinirla(o.egim, -MAKS_EGIM, MAKS_EGIM);

  // --- İtki ------------------------------------------------------------------
  const hizCarpani = girdi.hizli ? 1.75 : 1;

  const hedefHiz = girdi.ileri * maksHiz * hizCarpani;
  o.hiz += (hedefHiz - o.hiz) * (1 - Math.exp(-ivme * dt));

  // Yana kayma ileri yüzmeden yavaş: balık yan yüzmek için tasarlanmamış bir gövde.
  const hedefYanHiz = girdi.yana * maksHiz * 0.55 * hizCarpani;
  o.yanHiz += (hedefYanHiz - o.yanHiz) * (1 - Math.exp(-ivme * dt));

  // Dikey itki bakış yönünden bağımsız; burnu çevirmeden dikine çıkmayı sağlar.
  const hedefDikeyHiz = girdi.dikey * maksDikeyHiz * (girdi.hizli ? 1.6 : 1);
  o.dikeyHiz += (hedefDikeyHiz - o.dikeyHiz) * (1 - Math.exp(-ivme * dt));

  // --- Yer değişimi ----------------------------------------------------------
  const yatay = Math.cos(o.egim);
  o.ileri.set(Math.cos(o.yon) * yatay, Math.sin(o.egim), Math.sin(o.yon) * yatay);
  _sag.set(-Math.sin(o.yon), 0, Math.cos(o.yon));

  // Kamera yönü: balığın yönü + serbest bakış sapması.
  const kYon = o.yon + o.serbestYaw;
  const kEgim = sinirla(o.egim + o.serbestPitch, -MAKS_EGIM, MAKS_EGIM);
  const kYatay = Math.cos(kEgim);
  o.kameraIleri.set(Math.cos(kYon) * kYatay, Math.sin(kEgim), Math.sin(kYon) * kYatay);

  o.x += (o.ileri.x * o.hiz + _sag.x * o.yanHiz) * dt;
  o.z += (o.ileri.z * o.hiz + _sag.z * o.yanHiz) * dt;
  o.y += (o.ileri.y * o.hiz + o.dikeyHiz) * dt;

  // Resif hacminin dışına çıkmasın; kumun içine giremesin.
  o.x = sinirla(o.x, 8, GENISLIK - 8);
  o.z = sinirla(o.z, 8, Z_GENISLIK - 8);
  const taban = kumYuksekligi(o.x, o.z) - o.govde.boy * 0.15;
  const oncekiY = o.y;
  o.y = sinirla(o.y, KENAR_PAYI, taban);
  // Yüzeye ya da kuma dayanınca itki sıfırlanır; yoksa tuş basılı kaldığı sürece
  // birikip tuş bırakılınca balığı geri fırlatıyor.
  if (o.y !== oncekiY) o.dikeyHiz = 0;

  const toplamHiz = Math.hypot(o.hiz, o.yanHiz, o.dikeyHiz);
  const hizOrani = Math.min(1, toplamHiz / maksHiz);
  govdeGuncelle(o.govde, o.x, o.y, o.z, o.ileri, hizOrani, dt);
}

/** Evre değişince boy ve palet güncellenir. */
export function oyuncuEvresiniAyarla(o: Oyuncu, evre: number): void {
  if (o.evre === evre) return;
  o.evre = evre;
  o.govde.boy = evreBoyu(evre);
  o.govde.tur = oyuncuGorunumu(evre);
}

export function oyuncuYaricapi(o: Oyuncu): number {
  return o.govde.boy * 0.5;
}

const _agiz = { x: 0, y: 0, z: 0 };

/** Ağzın bulunduğu nokta — yeme kontrolü gövdenin ortasından değil buradan yapılır. */
export function agizNoktasi(o: Oyuncu): { x: number; y: number; z: number } {
  govdeAgzi(o.govde, _agiz);
  return _agiz;
}
