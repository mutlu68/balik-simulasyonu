import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { Scene } from "three";
import {
  ALAN_CARPANI,
  GENISLIK,
  Z_GENISLIK,
  dunyaKonumu,
  kumEgimi,
  kumYuksekligi,
} from "../core/dunya";
import { tohumluRng } from "../core/rng";
import type { Renk } from "./shapes";
import { suGolgesiUygula } from "./suShader";

/**
 * Resif florası — dipteki bitki örtüsü.
 *
 * Önceden tek bir bitki vardı: posidonia yaprağı, 2600 adet, hepsi aynı kutu geometrisi.
 * Bu, dibin her yerini aynı göstermenin en kısa yoluydu; bir koydan ötekine yüzdüğünde
 * hiçbir şey değişmiyordu. Şimdi sekiz tür var ve her biri **nereye yerleşeceğini**
 * kendisi biliyor — eğimli sırta çalı yosunu, düzlüğe çayır, kayanın üstüne yelpaze,
 * dibine şakayık. Resifi okunaklı yapan şey tür sayısı değil, türlerin **farklı yerlerde**
 * olması.
 *
 * Üçü aslında bitki değil, sabit yaşayan hayvan (yelpaze/gorgon, sünger, şakayık).
 * Akdeniz kayalığında dibin görüntüsünü onlar belirlediği için floranın parçası
 * sayıldılar.
 *
 * ### Ortak kurallar
 *
 * - Her geometri **birim kutuda** üretiliyor: y 0..1 (kök → uç), x/z ±0,5. Örnek
 *   matrisi (en, boy, en) ile ölçekliyor. Salınım shader'ı `position.y`'yi büküm
 *   ağırlığı olarak okuduğu için bu düzen zorunlu.
 * - Renk köşede taşınıyor (kökte koyu, uçta açık) ve örnek başına `setColorAt` ile
 *   dalgalandırılıyor. Böylece tek malzeme bütün türlere yetiyor.
 * - Salınım CPU'da değil vertex shader'ında — bkz. `suShader.ts`. Bitki sayısı
 *   9 binden 14 bine çıksa da kare maliyeti değişmiyor.
 */

type V3 = readonly [number, number, number];
type Renk01 = readonly [number, number, number];

const _renkGecici = new Color();

/** sRGB tablodan Three.js'in beklediği lineer köşe rengine. */
function dogrusal(renk: Renk): Renk01 {
  _renkGecici.setRGB(renk[0] / 255, renk[1] / 255, renk[2] / 255, SRGBColorSpace);
  return [_renkGecici.r, _renkGecici.g, _renkGecici.b];
}

function renkAra(a: Renk01, b: Renk01, t: number): Renk01 {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function birimle(v: V3): V3 {
  const uzunluk = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / uzunluk, v[1] / uzunluk, v[2] / uzunluk];
}

// ---------------------------------------------------------------------------
// Geometri yapıcısı
// ---------------------------------------------------------------------------

interface Yapici {
  /** p0-p1 alt kenar (renk `alt`), p3-p2 üst kenar (renk `ust`). */
  dortgen(p0: V3, p1: V3, p2: V3, p3: V3, alt: Renk01, ust: Renk01, esneklik: number): void;
  ucgen(p0: V3, p1: V3, p2: V3, renk: Renk01, ucRenk: Renk01, esneklik: number): void;
  bitir(): BufferGeometry;
}

function yapiciOlustur(): Yapici {
  const konum: number[] = [];
  const normal: number[] = [];
  const renk: number[] = [];
  const egilme: number[] = [];
  const indeks: number[] = [];

  function kose(p: V3, n: V3, r: Renk01, esneklik: number): number {
    const i = konum.length / 3;
    konum.push(p[0], p[1], p[2]);
    normal.push(n[0], n[1], n[2]);
    renk.push(r[0], r[1], r[2]);
    // Büküm ağırlığı: kökte sıfır, uçta en yüksek. 1,7 üssü hareketi üst üçte bire
    // topluyor — otsu bir bitki kökünden değil boyunca eğilir.
    const h = p[1] < 0 ? 0 : p[1] > 1 ? 1 : p[1];
    egilme.push(Math.pow(h, 1.7) * esneklik);
    return i;
  }

  function yuzeyNormali(p0: V3, p1: V3, p2: V3): V3 {
    const ax = p1[0] - p0[0];
    const ay = p1[1] - p0[1];
    const az = p1[2] - p0[2];
    const bx = p2[0] - p0[0];
    const by = p2[1] - p0[1];
    const bz = p2[2] - p0[2];
    return birimle([ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx]);
  }

  return {
    dortgen(p0, p1, p2, p3, alt, ust, esneklik) {
      const n = yuzeyNormali(p0, p1, p3);
      const a = kose(p0, n, alt, esneklik);
      const b = kose(p1, n, alt, esneklik);
      const c = kose(p2, n, ust, esneklik);
      const d = kose(p3, n, ust, esneklik);
      indeks.push(a, b, c, a, c, d);
    },

    ucgen(p0, p1, p2, renk0, ucRenk, esneklik) {
      const n = yuzeyNormali(p0, p1, p2);
      const a = kose(p0, n, renk0, esneklik);
      const b = kose(p1, n, renk0, esneklik);
      const c = kose(p2, n, ucRenk, esneklik);
      indeks.push(a, b, c);
    },

    bitir() {
      const geometri = new BufferGeometry();
      geometri.setAttribute("position", new BufferAttribute(new Float32Array(konum), 3));
      geometri.setAttribute("normal", new BufferAttribute(new Float32Array(normal), 3));
      geometri.setAttribute("color", new BufferAttribute(new Float32Array(renk), 3));
      // Salınım shader'ı bunu okuyor; adı `suShader.ts` ile eşleşmeli.
      geometri.setAttribute("aEgilme", new BufferAttribute(new Float32Array(egilme), 1));
      geometri.setIndex(indeks);
      return geometri;
    },
  };
}

/** Merkez çizgisi boyunca uzanan şerit — yaprak, dal, dokunaç hepsi bu. */
function serit(
  y: Yapici,
  noktalar: readonly V3[],
  genislikler: readonly number[],
  renkler: readonly Renk01[],
  eksenler: readonly V3[],
  esneklik: number,
): void {
  for (let i = 0; i < noktalar.length - 1; i++) {
    const a = noktalar[i]!;
    const b = noktalar[i + 1]!;
    const ea = eksenler[i]!;
    const eb = eksenler[i + 1]!;
    const wa = genislikler[i]! * 0.5;
    const wb = genislikler[i + 1]! * 0.5;
    y.dortgen(
      [a[0] - ea[0] * wa, a[1] - ea[1] * wa, a[2] - ea[2] * wa],
      [a[0] + ea[0] * wa, a[1] + ea[1] * wa, a[2] + ea[2] * wa],
      [b[0] + eb[0] * wb, b[1] + eb[1] * wb, b[2] + eb[2] * wb],
      [b[0] - eb[0] * wb, b[1] - eb[1] * wb, b[2] - eb[2] * wb],
      renkler[i]!,
      renkler[i + 1]!,
      esneklik,
    );
  }
}

/** Kapalı kesitli boru — süngerin parmakları için. */
function boru(
  y: Yapici,
  noktalar: readonly V3[],
  yaricaplar: readonly number[],
  renkler: readonly Renk01[],
  kenar: number,
  esneklik: number,
): void {
  const halkalar: V3[][] = [];
  for (let i = 0; i < noktalar.length; i++) {
    const onceki = noktalar[Math.max(0, i - 1)]!;
    const sonraki = noktalar[Math.min(noktalar.length - 1, i + 1)]!;
    const yon = birimle([
      sonraki[0] - onceki[0],
      sonraki[1] - onceki[1],
      sonraki[2] - onceki[2],
    ]);
    // Yöne dik iki eksen. Yön dikeye yakın olduğu için referans olarak z seçiliyor.
    const u = birimle([yon[1] * 1 - yon[2] * 0, yon[2] * 0 - yon[0] * 1, 0]);
    const v = birimle([
      yon[1] * u[2] - yon[2] * u[1],
      yon[2] * u[0] - yon[0] * u[2],
      yon[0] * u[1] - yon[1] * u[0],
    ]);
    const r = yaricaplar[i]!;
    const halka: V3[] = [];
    for (let k = 0; k < kenar; k++) {
      const aci = (k / kenar) * Math.PI * 2;
      const c = Math.cos(aci) * r;
      const s = Math.sin(aci) * r;
      halka.push([
        noktalar[i]![0] + u[0] * c + v[0] * s,
        noktalar[i]![1] + u[1] * c + v[1] * s,
        noktalar[i]![2] + u[2] * c + v[2] * s,
      ]);
    }
    halkalar.push(halka);
  }
  for (let i = 0; i < halkalar.length - 1; i++) {
    for (let k = 0; k < kenar; k++) {
      const k2 = (k + 1) % kenar;
      y.dortgen(
        halkalar[i]![k]!,
        halkalar[i]![k2]!,
        halkalar[i + 1]![k2]!,
        halkalar[i + 1]![k]!,
        renkler[i]!,
        renkler[i + 1]!,
        esneklik,
      );
    }
  }
}

/** Şerit ekseni: yatay düzlemde `aci` yönüne bakan birim vektör. */
function yatayEksen(aci: number): V3 {
  return [Math.cos(aci), 0, Math.sin(aci)];
}

// ---------------------------------------------------------------------------
// Tür geometrileri
// ---------------------------------------------------------------------------

/**
 * Deniz çayırı (Posidonia oceanica) yaprağı.
 *
 * Şerit düz bir dikdörtgen olduğu sürece plastik bant gibi duruyordu; boyunca burulma
 * ve hafif dışa kıvrılma eklendi. Beş bölüm, shader bükümünün yumuşak görünmesi için
 * alt sınır — iki bölümde büküm kırık bir çizgi gibi çıkıyor.
 */
function cayirYapragi(): BufferGeometry {
  const y = yapiciOlustur();
  const kok = dogrusal([24, 68, 44]);
  const orta = dogrusal([46, 118, 62]);
  const uc = dogrusal([132, 178, 86]);
  const bolum = 5;
  const noktalar: V3[] = [];
  const genislikler: number[] = [];
  const renkler: Renk01[] = [];
  const eksenler: V3[] = [];
  for (let i = 0; i <= bolum; i++) {
    const t = i / bolum;
    noktalar.push([Math.sin(t * 0.9) * 0.05, t, Math.sin(t * 1.35) * 0.17]);
    genislikler.push(1 - t * 0.42);
    renkler.push(t < 0.5 ? renkAra(kok, orta, t * 2) : renkAra(orta, uc, (t - 0.5) * 2));
    eksenler.push(birimle([Math.cos(t * 0.95), 0, Math.sin(t * 0.95) * 0.55]));
  }
  serit(y, noktalar, genislikler, renkler, eksenler, 1.3);
  return y.bitir();
}

/** Kum yosunu tutamı — dibi kaplayan kısa, sık tüyler. */
function yosunTutami(): BufferGeometry {
  const y = yapiciOlustur();
  const kok = dogrusal([46, 86, 58]);
  const uc = dogrusal([118, 156, 92]);
  for (let d = 0; d < 3; d++) {
    const aci = (d / 3) * Math.PI * 2 + 0.7;
    const egim = 0.26 + d * 0.06;
    const noktalar: V3[] = [
      [0, 0, 0],
      [Math.cos(aci) * egim * 0.4, 0.55, Math.sin(aci) * egim * 0.4],
      [Math.cos(aci) * egim, 1, Math.sin(aci) * egim],
    ];
    serit(
      y,
      noktalar,
      [0.8, 0.55, 0.16],
      [kok, renkAra(kok, uc, 0.5), uc],
      [yatayEksen(aci + 1.57), yatayEksen(aci + 1.57), yatayEksen(aci + 1.57)],
      0.95,
    );
  }
  return y.bitir();
}

/**
 * Yeşil tüy yosunu (Caulerpa) — kumun üstünde sürünen bir sap ve ondan kalkan
 * tüy biçimli filizler. Yaprakçıklar üçgen: 900 örnekte dörtgen kullanmak
 * geometriyi iki katına çıkarıyor ve o mesafede fark edilmiyor.
 */
function tuyYosunu(): BufferGeometry {
  const y = yapiciOlustur();
  const sapRenk = dogrusal([64, 118, 56]);
  const yaprakRenk = dogrusal([112, 186, 78]);
  const acikUc = dogrusal([168, 214, 104]);

  // Sürünen sap
  serit(
    y,
    [
      [-0.45, 0.02, -0.06],
      [0, 0.05, 0.05],
      [0.45, 0.02, -0.04],
    ],
    [0.1, 0.12, 0.09],
    [sapRenk, sapRenk, sapRenk],
    [yatayEksen(1.57), yatayEksen(1.57), yatayEksen(1.57)],
    0.25,
  );

  for (let f = 0; f < 3; f++) {
    const tabanX = -0.3 + f * 0.3;
    const tabanZ = (f % 2 === 0 ? 1 : -1) * 0.05;
    const aci = 0.6 + f * 2.1;
    const tepe = 0.85 + f * 0.05;
    const noktalar: V3[] = [
      [tabanX, 0.04, tabanZ],
      [tabanX + Math.cos(aci) * 0.05, tepe * 0.55, tabanZ + Math.sin(aci) * 0.05],
      [tabanX + Math.cos(aci) * 0.1, tepe, tabanZ + Math.sin(aci) * 0.1],
    ];
    serit(
      y,
      noktalar,
      [0.09, 0.07, 0.03],
      [sapRenk, yaprakRenk, acikUc],
      [yatayEksen(aci + 1.57), yatayEksen(aci + 1.57), yatayEksen(aci + 1.57)],
      0.7,
    );
    // Yaprakçıklar: sapın iki yanına dizilmiş küçük üçgenler.
    for (let i = 0; i < 5; i++) {
      const t = 0.15 + (i / 5) * 0.75;
      const yuk = tepe * t;
      const merkez: V3 = [tabanX + Math.cos(aci) * 0.1 * t, yuk, tabanZ + Math.sin(aci) * 0.1 * t];
      const boyut = 0.2 * (1 - t * 0.55);
      for (const isaret of [-1, 1]) {
        const sapmaAci = aci + 1.57 * isaret;
        y.ucgen(
          [merkez[0], merkez[1] - 0.02, merkez[2]],
          [merkez[0], merkez[1] + 0.02, merkez[2]],
          [
            merkez[0] + Math.cos(sapmaAci) * boyut,
            merkez[1] + boyut * 0.5,
            merkez[2] + Math.sin(sapmaAci) * boyut,
          ],
          yaprakRenk,
          acikUc,
          0.75,
        );
      }
    }
  }
  return y.bitir();
}

/**
 * Kahverengi çalı yosunu (Cystoseira) — kayalık ve yamaçların baskın algi.
 * Merkez gövde ve ondan çıkan dallar; dallar farklı yüksekliklerden ve farklı
 * yönlerden kalkıyor ki döndürerek çoğaltıldığında tekrar belli olmasın.
 */
function caliYosunu(): BufferGeometry {
  const y = yapiciOlustur();
  const rastgele = tohumluRng(94117);
  const dip = dogrusal([52, 40, 24]);
  const govdeRenk = dogrusal([94, 74, 36]);
  const ucRenk = dogrusal([142, 126, 64]);
  const yaprakRenk = dogrusal([108, 116, 54]);

  serit(
    y,
    [
      [0, 0, 0],
      [0.02, 0.3, 0.03],
      [0.05, 0.62, 0.01],
    ],
    [0.2, 0.16, 0.1],
    [dip, govdeRenk, govdeRenk],
    [yatayEksen(0.4), yatayEksen(0.5), yatayEksen(0.6)],
    0.5,
  );

  const dalSayisi = 7;
  for (let d = 0; d < dalSayisi; d++) {
    const aci = (d / dalSayisi) * Math.PI * 2 + rastgele() * 0.8;
    const taban = 0.14 + rastgele() * 0.42;
    const uzunluk = 0.34 + rastgele() * 0.34;
    const disa = 0.16 + rastgele() * 0.22;
    const kokNokta: V3 = [0.03, taban, 0.02];
    const tepe = Math.min(1, taban + uzunluk);
    const ortaNokta: V3 = [
      kokNokta[0] + Math.cos(aci) * disa * 0.6,
      taban + uzunluk * 0.55,
      kokNokta[2] + Math.sin(aci) * disa * 0.6,
    ];
    const ucNokta: V3 = [
      kokNokta[0] + Math.cos(aci) * disa,
      tepe,
      kokNokta[2] + Math.sin(aci) * disa,
    ];
    // Dallar ilk denemede 0,1 birim genişlikteydi ve bitki kuru bir çalı çırpısı
    // gibi görünüyordu. Kalınlaştırıp üstüne yaprakçık eklenince "kahverengi alg"
    // okunabiliyor.
    serit(
      y,
      [kokNokta, ortaNokta, ucNokta],
      [0.16, 0.2, 0.09],
      [govdeRenk, renkAra(govdeRenk, ucRenk, 0.6), ucRenk],
      [yatayEksen(aci + 1.57), yatayEksen(aci + 1.57), yatayEksen(aci + 1.57)],
      0.55,
    );
    for (let i = 0; i < 3; i++) {
      const t = 0.3 + i * 0.28;
      const merkez: V3 = [
        kokNokta[0] + (ucNokta[0] - kokNokta[0]) * t,
        taban + (tepe - taban) * t,
        kokNokta[2] + (ucNokta[2] - kokNokta[2]) * t,
      ];
      const yan = aci + (i % 2 === 0 ? 1.2 : -1.2);
      const boyut = 0.17 * (1 - t * 0.4);
      y.ucgen(
        [merkez[0], merkez[1] - 0.03, merkez[2]],
        [merkez[0], merkez[1] + 0.03, merkez[2]],
        [merkez[0] + Math.cos(yan) * boyut, merkez[1] + boyut * 0.7, merkez[2] + Math.sin(yan) * boyut],
        yaprakRenk,
        ucRenk,
        0.6,
      );
    }
  }
  return y.bitir();
}

/**
 * Deniz marulu (Ulva) — kırışık, ince, parlak yeşil levhalar.
 *
 * İlk denemede levhalar enden geniş ve yataya yakındı; ekranda yeşil bir pervane gibi
 * duruyordu. Şimdi dört dar levha dikine kalkıyor, kenarları boyunca dalgalanıyor ve
 * uca doğru genişliyor — deniz marulunun suda dalgalanan yaprağı böyle okunuyor.
 */
function denizMarulu(): BufferGeometry {
  const y = yapiciOlustur();
  const kok = dogrusal([48, 112, 54]);
  const uc = dogrusal([150, 214, 104]);
  const levhaSayisi = 4;
  const bolum = 4;
  for (let levha = 0; levha < levhaSayisi; levha++) {
    const aci = (levha / levhaSayisi) * Math.PI * 2 + 0.4;
    const eksen = yatayEksen(aci + Math.PI / 2);
    const disa = 0.12 + (levha % 2) * 0.09;
    const noktalar: V3[] = [];
    const genislikler: number[] = [];
    const renkler: Renk01[] = [];
    const eksenler: V3[] = [];
    for (let i = 0; i <= bolum; i++) {
      const t = i / bolum;
      const kivrim = Math.sin(t * 5.4 + levha * 1.7) * 0.14;
      noktalar.push([
        Math.cos(aci) * disa * t + eksen[0] * kivrim,
        t,
        Math.sin(aci) * disa * t + eksen[2] * kivrim,
      ]);
      genislikler.push(0.3 + Math.sin(t * 2.9 + levha) * 0.22 + t * 0.4);
      renkler.push(renkAra(kok, uc, t));
      eksenler.push(eksen);
    }
    serit(y, noktalar, genislikler, renkler, eksenler, 1.05);
  }
  return y.bitir();
}

/**
 * Deniz yelpazesi (Eunicella / gorgon) — kayanın üstünde, akıntıya dik duran
 * dallı yelpaze. Dallanma özyinelemeli: kökten dört seviye, her seviyede iki
 * dal ve biraz kısalma.
 */
function denizYelpazesi(): BufferGeometry {
  const y = yapiciOlustur();
  const kok = dogrusal([158, 96, 34]);
  const uc = dogrusal([242, 186, 104]);

  function dal(
    baslangic: V3,
    aci: number,
    uzunluk: number,
    kalinlik: number,
    derinlik: number,
    t: number,
  ): void {
    const bitis: V3 = [
      baslangic[0] + Math.sin(aci) * uzunluk,
      baslangic[1] + Math.cos(aci) * uzunluk,
      baslangic[2] + Math.sin(aci * 1.7) * uzunluk * 0.12,
    ];
    serit(
      y,
      [baslangic, bitis],
      [kalinlik, kalinlik * 0.72],
      [renkAra(kok, uc, t), renkAra(kok, uc, Math.min(1, t + 0.25))],
      [[0, 0, 1], [0, 0, 1]],
      0.4,
    );
    if (derinlik <= 0) return;
    const acilma = 0.42 + derinlik * 0.06;
    dal(bitis, aci - acilma, uzunluk * 0.74, kalinlik * 0.74, derinlik - 1, t + 0.25);
    dal(bitis, aci + acilma, uzunluk * 0.74, kalinlik * 0.74, derinlik - 1, t + 0.25);
  }

  dal([0, 0, 0], 0, 0.34, 0.12, 3, 0);
  return y.bitir();
}

/** Turuncu sünger (Axinella) — katı, dallı parmaklar. Salınımı neredeyse sıfır. */
function sunger(): BufferGeometry {
  const y = yapiciOlustur();
  const rastgele = tohumluRng(71829);
  const dip = dogrusal([146, 72, 34]);
  const ust = dogrusal([232, 132, 62]);
  for (let p = 0; p < 3; p++) {
    const aci = (p / 3) * Math.PI * 2 + rastgele();
    const tepe = 0.62 + rastgele() * 0.38;
    const disa = 0.1 + rastgele() * 0.16;
    const noktalar: V3[] = [
      [Math.cos(aci) * 0.1, 0, Math.sin(aci) * 0.1],
      [Math.cos(aci) * (0.1 + disa * 0.5), tepe * 0.5, Math.sin(aci) * (0.1 + disa * 0.5)],
      [Math.cos(aci) * (0.1 + disa), tepe * 0.85, Math.sin(aci) * (0.1 + disa)],
      [Math.cos(aci) * (0.1 + disa * 1.1), tepe, Math.sin(aci) * (0.1 + disa * 1.1)],
    ];
    boru(
      y,
      noktalar,
      [0.17, 0.14, 0.1, 0.05],
      [dip, renkAra(dip, ust, 0.5), ust, ust],
      5,
      0.06,
    );
  }
  return y.bitir();
}

/**
 * Deniz şakayığı (Anemonia viridis) — kayanın dibinde, mor uçlu yeşil dokunaçlar.
 * Gövde katı, dokunaçlar sahnedeki en esnek şey: akıntıda gözle görülür kıpırdıyor.
 */
function denizSakayigi(): BufferGeometry {
  const y = yapiciOlustur();
  const govdeRenk = dogrusal([120, 128, 96]);
  const dokunacRenk = dogrusal([108, 166, 118]);
  const morUc = dogrusal([186, 118, 168]);

  // Basık gövde
  const dilim = 8;
  for (let i = 0; i < dilim; i++) {
    const a0 = (i / dilim) * Math.PI * 2;
    const a1 = ((i + 1) / dilim) * Math.PI * 2;
    y.dortgen(
      [Math.cos(a0) * 0.3, 0, Math.sin(a0) * 0.3],
      [Math.cos(a1) * 0.3, 0, Math.sin(a1) * 0.3],
      [Math.cos(a1) * 0.2, 0.22, Math.sin(a1) * 0.2],
      [Math.cos(a0) * 0.2, 0.22, Math.sin(a0) * 0.2],
      dogrusal([92, 96, 74]),
      govdeRenk,
      0.05,
    );
  }

  const dokunacSayisi = 14;
  for (let d = 0; d < dokunacSayisi; d++) {
    const aci = (d / dokunacSayisi) * Math.PI * 2;
    const disa = 0.28 + (d % 3) * 0.08;
    const tepe = 0.72 + (d % 4) * 0.07;
    const noktalar: V3[] = [
      [Math.cos(aci) * 0.18, 0.2, Math.sin(aci) * 0.18],
      [Math.cos(aci) * (0.18 + disa * 0.6), 0.2 + (tepe - 0.2) * 0.6, Math.sin(aci) * (0.18 + disa * 0.6)],
      [Math.cos(aci) * (0.18 + disa), tepe, Math.sin(aci) * (0.18 + disa)],
    ];
    serit(
      y,
      noktalar,
      [0.11, 0.08, 0.03],
      [dokunacRenk, renkAra(dokunacRenk, morUc, 0.55), morUc],
      [yatayEksen(aci + 1.57), yatayEksen(aci + 1.57), yatayEksen(aci + 1.57)],
      1.6,
    );
  }
  return y.bitir();
}

// ---------------------------------------------------------------------------
// Tür tablosu
// ---------------------------------------------------------------------------

/** Bitkinin nereye yerleştiği. */
type Yerlesim = "duzluk" | "yamac" | "kayaDibi" | "kayaUstu";

interface BitkiTuru {
  readonly kimlik: string;
  readonly ad: string;
  geometri(): BufferGeometry;
  /** 600 × 400'lük ilk resif başına adet; gerçek sayı alan çarpanıyla ölçekleniyor. */
  readonly yogunluk: number;
  readonly yerlesim: Yerlesim;
  /** Küme başına kaç birey ve kümenin yarıçapı (dünya birimi). */
  readonly kume: readonly [number, number];
  readonly kumeYaricapi: number;
  readonly boy: readonly [number, number];
  readonly en: readonly [number, number];
  /** Örnek başına renk dalgalanması (0 = hepsi aynı). */
  readonly renkOynamasi: number;
}

const BITKI_TURLERI: readonly BitkiTuru[] = [
  {
    kimlik: "cayir",
    ad: "Deniz çayırı",
    geometri: cayirYapragi,
    yogunluk: 2250,
    yerlesim: "duzluk",
    kume: [110, 150],
    kumeYaricapi: 74,
    boy: [17, 46],
    en: [1.2, 3],
    renkOynamasi: 0.34,
  },
  {
    kimlik: "tutam",
    ad: "Kum yosunu",
    geometri: yosunTutami,
    yogunluk: 650,
    yerlesim: "duzluk",
    kume: [7, 12],
    kumeYaricapi: 30,
    boy: [4, 9],
    en: [2.5, 5],
    renkOynamasi: 0.4,
  },
  {
    kimlik: "tuyYosunu",
    ad: "Tüy yosunu",
    geometri: tuyYosunu,
    yogunluk: 175,
    yerlesim: "duzluk",
    kume: [4, 8],
    kumeYaricapi: 22,
    boy: [9, 17],
    en: [12, 23],
    renkOynamasi: 0.3,
  },
  {
    kimlik: "caliYosunu",
    ad: "Çalı yosunu",
    geometri: caliYosunu,
    yogunluk: 175,
    yerlesim: "yamac",
    kume: [3, 7],
    kumeYaricapi: 26,
    boy: [16, 31],
    en: [12, 23],
    renkOynamasi: 0.33,
  },
  {
    kimlik: "denizMarulu",
    ad: "Deniz marulu",
    geometri: denizMarulu,
    yogunluk: 110,
    yerlesim: "yamac",
    kume: [3, 6],
    kumeYaricapi: 18,
    boy: [11, 20],
    en: [6, 11],
    renkOynamasi: 0.28,
  },
  {
    kimlik: "yelpaze",
    ad: "Deniz yelpazesi",
    geometri: denizYelpazesi,
    yogunluk: 50,
    yerlesim: "kayaUstu",
    kume: [1, 3],
    kumeYaricapi: 0,
    boy: [22, 42],
    en: [18, 34],
    renkOynamasi: 0.26,
  },
  {
    kimlik: "sunger",
    ad: "Turuncu sünger",
    geometri: sunger,
    yogunluk: 60,
    yerlesim: "kayaUstu",
    kume: [1, 3],
    kumeYaricapi: 0,
    boy: [11, 24],
    en: [10, 19],
    renkOynamasi: 0.24,
  },
  {
    kimlik: "sakayik",
    ad: "Deniz şakayığı",
    geometri: denizSakayigi,
    yogunluk: 70,
    yerlesim: "kayaDibi",
    kume: [2, 5],
    kumeYaricapi: 22,
    boy: [8, 16],
    en: [12, 21],
    renkOynamasi: 0.3,
  },
];

// ---------------------------------------------------------------------------
// Yerleşim ve sahneye ekleme
// ---------------------------------------------------------------------------

/** `environment.ts`'in ürettiği kayalar — üstlerine ve diplerine bitki yerleşiyor. */
export interface Kaya {
  readonly x: number;
  readonly z: number;
  /** Kaya merkezinin simülasyon y'si (büyük = derin). */
  readonly merkezY: number;
  readonly yatayYaricap: number;
  readonly dikeyYaricap: number;
}

interface Yerlesme {
  readonly x: number;
  readonly z: number;
  /** Simülasyon y'si (bitkinin kökü). */
  readonly y: number;
  readonly boy: number;
  readonly en: number;
  readonly yaw: number;
  /** Kayaya oturan bitkilerde dışa yatma açısı. */
  readonly egim: number;
  readonly egimYonu: number;
  readonly renk: number;
}

export interface Flora {
  readonly toplam: number;
  readonly turSayisi: number;
  readonly cizimCagrisi: number;
}

/** Düzlük eşiği: bunun üstündeki eğim "yamaç" sayılıyor. */
const DUZLUK_ESIGI = 0.13;

export function bitkileriKur(sahne: Scene, kayalar: readonly Kaya[]): Flora {
  const rastgele = tohumluRng(20260922);
  const malzeme = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0,
    side: DoubleSide,
  });
  suGolgesiUygula(malzeme, { salinim: true });

  const matris = new Matrix4();
  const konum = new Vector3();
  const olcek = new Vector3();
  const donus = new Quaternion();
  const eksen = new Vector3();
  const renk = new Color();

  let toplam = 0;
  let cizimCagrisi = 0;

  for (const tur of BITKI_TURLERI) {
    const hedef = Math.round(tur.yogunluk * ALAN_CARPANI);
    const yerlesmeler =
      tur.yerlesim === "kayaUstu" || tur.yerlesim === "kayaDibi"
        ? kayaYerlesimi(tur, hedef, kayalar, rastgele)
        : kumYerlesimi(tur, hedef, rastgele);
    if (yerlesmeler.length === 0) continue;

    const geometri = tur.geometri();
    // Kalabalık türler bölünüyor: tek bir InstancedMesh sahnenin tamamını kaplayan
    // bir sınır küresine sahip olur ve **hiçbir zaman** ayıklanmaz, yani arkandaki
    // 9 bin yaprak da her karede işlenir. Parçalara bölününce görüş alanı dışındakiler
    // düşüyor; bedeli birkaç fazladan çizim çağrısı.
    const parca = yerlesmeler.length > 1500 ? 4 : 1;
    const kutular = parcalaraAyir(yerlesmeler, parca);

    for (const kutu of kutular) {
      if (kutu.length === 0) continue;
      const mesh = new InstancedMesh(geometri, malzeme, kutu.length);
      for (let i = 0; i < kutu.length; i++) {
        const b = kutu[i]!;
        dunyaKonumu(b.x, b.y, b.z, konum);
        donus.setFromAxisAngle(new Vector3(0, 1, 0), b.yaw);
        if (b.egim !== 0) {
          eksen.set(Math.cos(b.egimYonu), 0, Math.sin(b.egimYonu));
          donus.multiply(new Quaternion().setFromAxisAngle(eksen, b.egim));
        }
        olcek.set(b.en, b.boy, b.en);
        mesh.setMatrixAt(i, matris.compose(konum, donus, olcek));
        // Renk dalgalanması: aynı geometriden çoğaltılan bitkiler tek tonda olunca
        // boyalı görünüyor. Yeşil kanal daha az oynatılıyor, yoksa tür kimliği kayıyor.
        const s = b.renk;
        renk.setRGB(1 + s * 1.15, 1 + s * 0.6, 1 + s * 1.3);
        mesh.setColorAt(i, renk);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      sahne.add(mesh);
      cizimCagrisi++;
    }
    toplam += yerlesmeler.length;
  }

  return { toplam, turSayisi: BITKI_TURLERI.length, cizimCagrisi };
}

/** Kuma yerleşen türler: küme merkezi habitatı tutuncaya kadar aday deneniyor. */
function kumYerlesimi(
  tur: BitkiTuru,
  hedef: number,
  rastgele: () => number,
): Yerlesme[] {
  const yerlesmeler: Yerlesme[] = [];
  const kumeOrtalamasi = (tur.kume[0] + tur.kume[1]) / 2;
  const kumeSayisi = Math.max(1, Math.round(hedef / kumeOrtalamasi));

  for (let k = 0; k < kumeSayisi && yerlesmeler.length < hedef; k++) {
    let merkezX = 0;
    let merkezZ = 0;
    let bulundu = false;
    // Eğim koşulunu tutan bir merkez ara. 24 denemede bulunamazsa bu kümeyi atla —
    // döngüyü sonsuza kadar sürdürmek, uygun alanı olmayan bir türde kilitlenmek demek.
    for (let deneme = 0; deneme < 24; deneme++) {
      const x = rastgele() * GENISLIK;
      const z = rastgele() * Z_GENISLIK;
      const egim = kumEgimi(x, z);
      const uygun = tur.yerlesim === "yamac" ? egim > DUZLUK_ESIGI : egim < DUZLUK_ESIGI;
      if (uygun) {
        merkezX = x;
        merkezZ = z;
        bulundu = true;
        break;
      }
    }
    if (!bulundu) continue;

    const adet = Math.round(tur.kume[0] + rastgele() * (tur.kume[1] - tur.kume[0]));
    for (let i = 0; i < adet && yerlesmeler.length < hedef; i++) {
      // Merkeze yakın sık, kenara doğru seyrek: karekök dağılımı yerine kare alarak
      // kümeye gerçek bir "öbek" görüntüsü veriliyor.
      const aci = rastgele() * Math.PI * 2;
      const uzaklik = rastgele() ** 2 * tur.kumeYaricapi;
      const x = merkezX + Math.cos(aci) * uzaklik;
      const z = merkezZ + Math.sin(aci) * uzaklik;
      if (x < 4 || x > GENISLIK - 4 || z < 4 || z > Z_GENISLIK - 4) continue;
      yerlesmeler.push({
        x,
        z,
        y: kumYuksekligi(x, z),
        boy: tur.boy[0] + rastgele() * (tur.boy[1] - tur.boy[0]),
        en: tur.en[0] + rastgele() * (tur.en[1] - tur.en[0]),
        yaw: rastgele() * Math.PI * 2,
        egim: 0,
        egimYonu: 0,
        renk: (rastgele() - 0.5) * tur.renkOynamasi,
      });
    }
  }
  return yerlesmeler;
}

/** Kayaya yerleşen türler: üstü (yelpaze, sünger) ya da dibi (şakayık). */
function kayaYerlesimi(
  tur: BitkiTuru,
  hedef: number,
  kayalar: readonly Kaya[],
  rastgele: () => number,
): Yerlesme[] {
  const yerlesmeler: Yerlesme[] = [];
  if (kayalar.length === 0) return yerlesmeler;
  const ustte = tur.yerlesim === "kayaUstu";

  // Kayalar arasında rastgele gez; büyük kayalar daha çok konuk alsın.
  for (let deneme = 0; deneme < hedef * 6 && yerlesmeler.length < hedef; deneme++) {
    const kaya = kayalar[Math.floor(rastgele() * kayalar.length)]!;
    if (kaya.yatayYaricap < (ustte ? 9 : 6)) continue;

    const aci = rastgele() * Math.PI * 2;
    if (ustte) {
      // Kaya yüzeyinde bir nokta: yatay uzaklık seçilip o noktadaki elipsoit
      // yüksekliği hesaplanıyor. Bitki kayanın eğimi yönünde dışa yatıyor.
      const oran = rastgele() * 0.62;
      const r = kaya.yatayYaricap * oran;
      const yuzeyY = kaya.merkezY - kaya.dikeyYaricap * Math.sqrt(Math.max(0, 1 - oran * oran));
      yerlesmeler.push({
        x: kaya.x + Math.cos(aci) * r,
        z: kaya.z + Math.sin(aci) * r,
        // Bir tık içeri gömülsün, taban kayanın yüzeyinde boşlukta durmasın.
        y: yuzeyY + 1.2,
        boy: tur.boy[0] + rastgele() * (tur.boy[1] - tur.boy[0]),
        en: tur.en[0] + rastgele() * (tur.en[1] - tur.en[0]),
        yaw: rastgele() * Math.PI * 2,
        egim: oran * 0.55,
        egimYonu: aci + Math.PI / 2,
        renk: (rastgele() - 0.5) * tur.renkOynamasi,
      });
    } else {
      const r = kaya.yatayYaricap * (0.85 + rastgele() * 0.5);
      const x = kaya.x + Math.cos(aci) * r;
      const z = kaya.z + Math.sin(aci) * r;
      if (x < 4 || x > GENISLIK - 4 || z < 4 || z > Z_GENISLIK - 4) continue;
      yerlesmeler.push({
        x,
        z,
        y: kumYuksekligi(x, z),
        boy: tur.boy[0] + rastgele() * (tur.boy[1] - tur.boy[0]),
        en: tur.en[0] + rastgele() * (tur.en[1] - tur.en[0]),
        yaw: rastgele() * Math.PI * 2,
        egim: 0,
        egimYonu: 0,
        renk: (rastgele() - 0.5) * tur.renkOynamasi,
      });
    }
  }
  return yerlesmeler;
}

/** Yerleşmeleri `bolum × bolum` konuma göre ayırır (görüş alanı ayıklaması için). */
function parcalaraAyir(yerlesmeler: readonly Yerlesme[], bolum: number): Yerlesme[][] {
  if (bolum <= 1) return [yerlesmeler.slice()];
  const kutular: Yerlesme[][] = [];
  for (let i = 0; i < bolum * bolum; i++) kutular.push([]);
  for (const b of yerlesmeler) {
    const i = Math.min(bolum - 1, Math.floor((b.x / GENISLIK) * bolum));
    const j = Math.min(bolum - 1, Math.floor((b.z / Z_GENISLIK) * bolum));
    kutular[j * bolum + i]!.push(b);
  }
  return kutular;
}
