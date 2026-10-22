import {
  BufferAttribute,
  Color,
  SRGBColorSpace,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { dunyaKonumu } from "../core/dunya";
import { profilOku } from "./shapes";
import type { Renk } from "./shapes";

/**
 * Omurga tabanlı prosedürel balık — 3B.
 *
 * 2B sürümdeki fikir aynen taşındı: balık uç uca bağlı eklemlerden oluşan bir omurga,
 * baş hareket eder, gövde onu belirli bir mesafe ve en fazla belirli bir açıyla takip
 * eder, üstüne yüzme dalgası biner. Değişen tek şey eklemlerin artık üç boyutlu olması
 * ve gövdenin eğri yerine **boru (tube) mesh'i** olarak çizilmesi.
 *
 * Üç önemli karar:
 *
 * 1. **Halkalar elips.** Balık yandan basıktır: dikey yarıçap tam, yatay yarıçap onun
 *    ~0,42 katı. Silueti veren şey bu — daire kesit kullanılırsa sosis gibi görünüyor.
 * 2. **Ters gölgeleme vertex renkleriyle.** Halka açısına göre üstte sırt, yanda yan,
 *    altta karın rengi. Doku gerekmiyor; 2B'deki görünüm bedavaya geliyor.
 * 3. **Yüzgeçler aynı geometriye kaynatıldı.** Balık başına tek draw call.
 *
 * Gövde dalgası düşük, kuyruk yüzgecinin kendi salınımı yüksek (carangiform yüzme):
 * çipura/levrek gövdesini dümdüz tutup itişi kuyruktan alır. 2B'de ayarlanan bu
 * davranış birebir korundu.
 */

/** Gövde kesitindeki köşe sayısı. 8 yeterli; 12'de fark görünmüyor, maliyet artıyor. */
const HALKA = 8;
/**
 * Balığın varsayılan yanal basıklığı: yatay yarıçap / dikey yarıçap. 1'in altı
 * yandan basık (çoğu kemikli balık), üstü yayvan.
 *
 * Tür bunu `yanalBasiklik` ile ezebiliyor: kalkan gibi dipte yatan balıklar yatayda
 * geniş (>1), karagöz/dülger gibi levha gövdeliler çok daha basık (<0.35).
 */
const YANAL_BASIKLIK = 0.42;
/**
 * Isırma animasyonunun süresi (saniye). Kısa tutuldu: yem yakalamak ani bir
 * hareket, uzun bir çene açılışı balığı esneyen bir şeye benzetiyor.
 */
const ISIRMA_SURESI = 0.22;

/**
 * Ağız açılınca baş halkasının dikeyde ne kadar büyüdüğü. Alt ve üst ayrı:
 * gerçek bir çene açılışında alt çene düşer, üst çene neredeyse durur. İkisini
 * simetrik büyütünce baş balon gibi şişiyordu.
 */
const ISIRMA_ALT = 1.15;
const ISIRMA_UST = 0.22;

/** Gözün oturduğu eklem — baş halkası burun olduğu için bir sonraki. */
const GOZ_EKLEMI = 1;
const GOZ_RENGI: Renk = [16, 14, 12];
const _renkGecici = new Color();

export interface TurGorunumu {
  readonly eklemSayisi: number;
  /** Gövde yarıçapı: baştan (0) kuyruğa (1) örneklenmiş, balık boyuna oranlı. */
  readonly genislikProfili: readonly number[];
  readonly sirt: Renk;
  readonly yan: Renk;
  readonly karin: Renk;
  readonly yuzgec: Renk;
  /**
   * Gövde boyunca uzanan yatay şerit(ler) — sarpanın sarı çizgileri, çipuranın
   * altın bandı. 3B'de ayrı bir doku gerekmiyor: halkanın belirli açılarındaki
   * köşeleri şerit rengine boyamak aynı işi görüyor.
   */
  readonly seritRengi?: Renk;
  readonly seritSayisi?: number;
  readonly kuyrukBoyu: number;
  readonly kuyrukYuksekligi: number;
  readonly kuyrukCatali: number;
  readonly sirtYuzgeci: { bas: number; son: number; yukseklik: number } | null;
  readonly analYuzgec: { bas: number; son: number; yukseklik: number } | null;
  readonly gogusYuzgeci: { konum: number; boy: number } | null;
  /** Yanal basıklık; verilmezse 0.42. Yatayda yayvan balıklar için 1'in üstü. */
  readonly yanalBasiklik?: number;
  readonly dalgaGenligi: number;
  readonly dalgaBoyu: number;
  readonly maksBukum: number;
  readonly gozOrani: number;
}

interface Eklem {
  /** Simülasyon koordinatında konum. */
  readonly konum: Vector3;
  /** Bu eklemin ileri baktığı birim vektör (simülasyon koordinatında). */
  readonly ileri: Vector3;
}

export interface Govde {
  tur: TurGorunumu;
  eklemler: Eklem[];
  faz: number;
  boy: number;
  /**
   * Isırma animasyonunun ilerlemesi, 0..1. 1 = bitti (ağız kapalı), bu yüzden
   * balıklar 1 ile başlıyor. `isirmaBaslat()` sıfırlayıp yeniden oynatır.
   */
  isirma: number;
  /**
   * Yenebilirlik vurgusu: **+** yaklaşan ve yenebilen (parlar), **−** yaklaşan ama
   * çok büyük (solar), 0 nötr. `govdeVurgusuAyarla()` ile sürülüyor.
   */
  vurgu: number;
  readonly mesh: Mesh;
  /** Balığın kendi yukarı ekseni — yalpalamayı önlemek için yumuşatılarak taşınıyor. */
  readonly yukari: Vector3;
  readonly geometri: BufferGeometry;
  readonly konumlar: Float32Array;
  /** Yüzgeç köşelerinin geometrideki başlangıç indeksleri. */
  readonly bolum: Bolumler;
}

interface Bolumler {
  readonly govdeBas: number;
  readonly burun: number;
  readonly sirtBas: number;
  readonly sirtAdet: number;
  readonly analBas: number;
  readonly analAdet: number;
  readonly kuyrukBas: number;
  readonly gogusBas: number;
  readonly toplam: number;
}

// Geçici vektörler — her karede yeniden ayırmamak için.
const _a = new Vector3();
const _b = new Vector3();
const _sag = new Vector3();
const _yukari = new Vector3();
const _geri = new Vector3();
const _dunya = new Vector3();
const DUNYA_YUKARI = new Vector3(0, -1, 0); // simülasyonda y aşağı doğru artıyor

function segmentUzunlugu(boy: number, eklemSayisi: number): number {
  return boy / (eklemSayisi - 1);
}

function yuzgecAdedi(ayar: { bas: number; son: number } | null, eklemSayisi: number): number {
  if (!ayar) return 0;
  const n = eklemSayisi - 1;
  const ilk = Math.max(0, Math.round(ayar.bas * n));
  const son = Math.min(n, Math.round(ayar.son * n));
  return son > ilk ? son - ilk + 1 : 0;
}

/** Geometri topolojisi bir kez kuruluyor; her karede yalnızca konumlar güncelleniyor. */
function geometriKur(tur: TurGorunumu): {
  geometri: BufferGeometry;
  konumlar: Float32Array;
  bolum: Bolumler;
} {
  const n = tur.eklemSayisi;
  const sirtAdet = yuzgecAdedi(tur.sirtYuzgeci, n);
  const analAdet = yuzgecAdedi(tur.analYuzgec, n);

  const govdeBas = 0;
  const burun = govdeBas + n * HALKA;
  const sirtBas = burun + 1;
  const analBas = sirtBas + sirtAdet * 2;
  const kuyrukBas = analBas + analAdet * 2;
  const gogusBas = kuyrukBas + 4;
  const toplam = gogusBas + (tur.gogusYuzgeci ? 8 : 0);

  const konumlar = new Float32Array(toplam * 3);
  const renkler = new Float32Array(toplam * 3);
  const indisler: number[] = [];

  // --- Gövde: ardışık halkalar arasında dörtgenler ---
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < HALKA; k++) {
      const k2 = (k + 1) % HALKA;
      const a = govdeBas + i * HALKA + k;
      const b = govdeBas + i * HALKA + k2;
      const c = govdeBas + (i + 1) * HALKA + k2;
      const d = govdeBas + (i + 1) * HALKA + k;
      indisler.push(a, b, c, a, c, d);
    }
  }
  // Burun: ilk halkadan tek noktaya yelpaze
  for (let k = 0; k < HALKA; k++) {
    indisler.push(burun, govdeBas + ((k + 1) % HALKA), govdeBas + k);
  }

  // --- Sırt / anal yüzgeç: iç ve dış kenar arasında şerit ---
  for (const [bas, adet] of [
    [sirtBas, sirtAdet],
    [analBas, analAdet],
  ] as const) {
    for (let i = 0; i < adet - 1; i++) {
      const ic0 = bas + i * 2;
      const dis0 = ic0 + 1;
      const ic1 = bas + (i + 1) * 2;
      const dis1 = ic1 + 1;
      indisler.push(ic0, dis0, dis1, ic0, dis1, ic1);
    }
  }

  // --- Kuyruk: kök, üst uç, çatal girintisi, alt uç ---
  indisler.push(kuyrukBas, kuyrukBas + 1, kuyrukBas + 2);
  indisler.push(kuyrukBas, kuyrukBas + 2, kuyrukBas + 3);

  // --- Göğüs yüzgeçleri: iki küçük dörtgen ---
  if (tur.gogusYuzgeci) {
    for (let taraf = 0; taraf < 2; taraf++) {
      const b = gogusBas + taraf * 4;
      indisler.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }

  // --- Vertex renkleri (sabit): halka açısına göre ters gölgeleme ---
  // Vertex renkleri shader'a lineer uzayda gider; tablodaki değerler sRGB olduğu
  // için dönüştürmeden yazmak balıkları solgun/parlak gösteriyordu.
  const renkYaz = (indeks: number, renk: Renk) => {
    _renkGecici.setRGB(renk[0] / 255, renk[1] / 255, renk[2] / 255, SRGBColorSpace);
    renkler[indeks * 3] = _renkGecici.r;
    renkler[indeks * 3 + 1] = _renkGecici.g;
    renkler[indeks * 3 + 2] = _renkGecici.b;
  };
  /** Şeritlerin bulunduğu "üstlük" değerleri (gövde yanında eşit aralıklı). */
  const seritler: number[] = [];
  if (tur.seritRengi && tur.seritSayisi) {
    for (let s = 0; s < tur.seritSayisi; s++) {
      seritler.push(0.55 - ((s + 1) / (tur.seritSayisi + 1)) * 1.1);
    }
  }

  for (let i = 0; i < n; i++) {
    for (let k = 0; k < HALKA; k++) {
      // k = 0 üst (sırt), HALKA/2 alt (karın)
      const aci = (k / HALKA) * Math.PI * 2;
      const ustluk = Math.cos(aci); // +1 sırt, -1 karın
      let renk: Renk =
        ustluk > 0.35 ? tur.sirt : ustluk < -0.35 ? tur.karin : tur.yan;
      // Şerit: bu köşe bir şerit hizasına yeterince yakınsa şerit rengi alır.
      if (tur.seritRengi) {
        for (const hiza of seritler) {
          if (Math.abs(ustluk - hiza) < 0.18) {
            renk = tur.seritRengi;
            break;
          }
        }
      }
      // Göz: başın iki yanındaki köşeler koyu boyanıyor. Ayrı bir küre eklemek
      // balık başına iki draw call daha demekti; vertex rengi bedava.
      if (i === GOZ_EKLEMI && (k === HALKA / 4 || k === (HALKA * 3) / 4)) {
        renk = GOZ_RENGI;
      }
      renkYaz(govdeBas + i * HALKA + k, renk);
    }
  }
  renkYaz(burun, tur.yan);
  for (let i = sirtBas; i < kuyrukBas + 4; i++) renkYaz(i, tur.yuzgec);
  for (let i = gogusBas; i < toplam; i++) renkYaz(i, tur.yuzgec);

  const geometri = new BufferGeometry();
  geometri.setAttribute("position", new BufferAttribute(konumlar, 3));
  geometri.setAttribute("color", new BufferAttribute(renkler, 3));
  geometri.setIndex(indisler);

  return { geometri, konumlar, bolum: { govdeBas, burun, sirtBas, sirtAdet, analBas, analAdet, kuyrukBas, gogusBas, toplam } };
}

export function govdeOlustur(
  tur: TurGorunumu,
  boy: number,
  x: number,
  y: number,
  z: number,
  aci: number,
): Govde {
  const { geometri, konumlar, bolum } = geometriKur(tur);

  const malzeme = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.52,
    metalness: 0.18,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometri, malzeme);
  // Köşeler dünya koordinatında yazılıyor; kesme (culling) için sınır küresi
  // her karede güncellenmeyeceğinden kapatıyoruz. 60 balıkta maliyeti yok.
  mesh.frustumCulled = false;

  const seg = segmentUzunlugu(boy, tur.eklemSayisi);
  const eklemler: Eklem[] = [];
  for (let i = 0; i < tur.eklemSayisi; i++) {
    eklemler.push({
      konum: new Vector3(x - Math.cos(aci) * seg * i, y, z - Math.sin(aci) * seg * i),
      ileri: new Vector3(Math.cos(aci), 0, Math.sin(aci)),
    });
  }

  return {
    tur,
    eklemler,
    faz: Math.random() * Math.PI * 2,
    isirma: 1,
    vurgu: 0,
    boy,
    mesh,
    yukari: new Vector3(0, -1, 0),
    geometri,
    konumlar,
    bolum,
  };
}

/**
 * Başı verilen konuma taşır ve gövdeyi arkasından sürükler.
 *
 * `ileri` balığın baktığı birim vektör, `hizOrani` 0..1.
 */
export function govdeGuncelle(
  g: Govde,
  basX: number,
  basY: number,
  basZ: number,
  ileri: Vector3,
  hizOrani: number,
  dt: number,
): void {
  const { tur } = g;
  const seg = segmentUzunlugu(g.boy, tur.eklemSayisi);

  g.faz += (1.3 + hizOrani * 7) * dt;
  if (g.isirma < 1) g.isirma = Math.min(1, g.isirma + dt / ISIRMA_SURESI);

  const bas = g.eklemler[0]!;
  bas.konum.set(basX, basY, basZ);
  bas.ileri.copy(ileri).normalize();

  // Balığın yukarı ekseni: dünya yukarısının ileri yöne dik bileşeni. Balık dikeye
  // yaklaşınca bu dejenere olur, o yüzden son geçerli değeri yumuşatarak taşıyoruz —
  // aksi halde balık dikey yüzerken kendi ekseninde takla atıyor.
  _yukari.copy(DUNYA_YUKARI).addScaledVector(bas.ileri, -DUNYA_YUKARI.dot(bas.ileri));
  if (_yukari.lengthSq() > 0.04) {
    g.yukari.lerp(_yukari.normalize(), Math.min(1, 6 * dt)).normalize();
  }

  for (let i = 1; i < g.eklemler.length; i++) {
    const onceki = g.eklemler[i - 1]!;
    const eklem = g.eklemler[i]!;
    const t = i / (g.eklemler.length - 1);

    // Mevcut yön: önceki eklemden bu ekleme doğru (geriye).
    _geri.subVectors(eklem.konum, onceki.konum);
    if (_geri.lengthSq() < 1e-6) _geri.copy(onceki.ileri).multiplyScalar(-1);
    _geri.normalize();

    // Yüzme dalgası: balığın kendi yukarı ekseni etrafında yanal salınım.
    // Gövdenin ön %35'i neredeyse sabit kalmalı; baştan kıvrılan balık yılan gibi
    // görünüyordu.
    const kuyrukAgirligi = Math.max(0, (t - 0.35) / 0.65);
    const genlik =
      tur.dalgaGenligi * kuyrukAgirligi * kuyrukAgirligi * (0.2 + 0.8 * hizOrani);
    const salinim = Math.sin(g.faz - t * tur.dalgaBoyu * Math.PI * 2) * genlik;
    if (salinim !== 0) _geri.applyAxisAngle(g.yukari, salinim).normalize();

    // Büküm kısıtı: önceki eklemin geri yönünden fazla sapamaz.
    _a.copy(onceki.ileri).multiplyScalar(-1);
    const acilik = Math.acos(Math.max(-1, Math.min(1, _geri.dot(_a))));
    if (acilik > tur.maksBukum) {
      // Fazlalığı geri al: hedef yöne doğru izin verilen kadar dön.
      _b.crossVectors(_a, _geri);
      if (_b.lengthSq() > 1e-8) {
        _b.normalize();
        _geri.copy(_a).applyAxisAngle(_b, tur.maksBukum).normalize();
      } else {
        _geri.copy(_a);
      }
    }

    eklem.konum.copy(onceki.konum).addScaledVector(_geri, seg);
    eklem.ileri.copy(_geri).multiplyScalar(-1);
  }

  mesheYaz(g);
}

/** Omurgayı mesh köşelerine çevirir. */
function mesheYaz(g: Govde): void {
  const { tur, bolum, konumlar, eklemler } = g;
  const n = eklemler.length;

  const yaz = (indeks: number, x: number, y: number, z: number) => {
    dunyaKonumu(x, y, z, _dunya);
    konumlar[indeks * 3] = _dunya.x;
    konumlar[indeks * 3 + 1] = _dunya.y;
    konumlar[indeks * 3 + 2] = _dunya.z;
  };

  const basiklik = tur.yanalBasiklik ?? YANAL_BASIKLIK;

  // Isırma genliği: 0'dan 1'e çıkıp 0'a döner, yani ağız açılıp kapanır.
  const agiz = g.isirma < 1 ? Math.sin(Math.PI * g.isirma) : 0;

  // --- Gövde halkaları ---
  for (let i = 0; i < n; i++) {
    const e = eklemler[i]!;
    const t = i / (n - 1);
    const yariCap = profilOku(tur.genislikProfili, t) * g.boy;
    _sag.crossVectors(e.ileri, g.yukari).normalize();

    // Ağız yalnızca baş halkasında tam açılır, ikinci halkada yarı — sadece ilk
    // halka oynarsa baş ile gövde arasında keskin bir basamak oluşuyor.
    const agizPayi = agiz * (i === 0 ? 1 : i === 1 ? 0.4 : 0);

    for (let k = 0; k < HALKA; k++) {
      const aci = (k / HALKA) * Math.PI * 2;
      const yukariBilesen = Math.cos(aci);
      const cene = yukariBilesen < 0 ? ISIRMA_ALT : ISIRMA_UST;
      const dikey = yukariBilesen * yariCap * (1 + agizPayi * cene);
      const yatay = Math.sin(aci) * yariCap * basiklik;
      yaz(
        bolum.govdeBas + i * HALKA + k,
        e.konum.x + g.yukari.x * dikey + _sag.x * yatay,
        e.konum.y + g.yukari.y * dikey + _sag.y * yatay,
        e.konum.z + g.yukari.z * dikey + _sag.z * yatay,
      );
    }
  }

  // --- Burun ---
  const basEklem = eklemler[0]!;
  // Ağız açılırken burun öne uzar: yemi "kapma" hareketi böyle okunuyor.
  const burunUzunlugu = profilOku(tur.genislikProfili, 0) * g.boy * (0.9 + agiz * 0.5);
  yaz(
    bolum.burun,
    basEklem.konum.x + basEklem.ileri.x * burunUzunlugu,
    basEklem.konum.y + basEklem.ileri.y * burunUzunlugu,
    basEklem.konum.z + basEklem.ileri.z * burunUzunlugu,
  );

  // --- Sırt ve anal yüzgeç ---
  yuzgecYaz(g, tur.sirtYuzgeci, bolum.sirtBas, bolum.sirtAdet, 1, yaz);
  yuzgecYaz(g, tur.analYuzgec, bolum.analBas, bolum.analAdet, -1, yaz);

  // --- Kuyruk ---
  kuyrukYaz(g, yaz);

  // --- Göğüs yüzgeçleri ---
  if (tur.gogusYuzgeci) gogusYaz(g, yaz);

  g.geometri.attributes.position!.needsUpdate = true;
  g.geometri.computeVertexNormals();
}

type Yazici = (indeks: number, x: number, y: number, z: number) => void;

function yuzgecYaz(
  g: Govde,
  ayar: { bas: number; son: number; yukseklik: number } | null,
  bas: number,
  adet: number,
  taraf: 1 | -1,
  yaz: Yazici,
): void {
  if (!ayar || adet === 0) return;
  const n = g.eklemler.length - 1;
  const ilk = Math.max(0, Math.round(ayar.bas * n));

  for (let i = 0; i < adet; i++) {
    const eklemIndeksi = Math.min(n, ilk + i);
    const e = g.eklemler[eklemIndeksi]!;
    const t = eklemIndeksi / n;
    const yariCap = profilOku(g.tur.genislikProfili, t) * g.boy;
    // Yüzgeç uçlara doğru incelir (yarım sinüs).
    const yerel = adet > 1 ? i / (adet - 1) : 0.5;
    const yukseklik = Math.sin(yerel * Math.PI) * ayar.yukseklik * g.boy;

    const icMesafe = yariCap * 0.85 * taraf;
    const disMesafe = (yariCap + yukseklik) * taraf;
    yaz(
      bas + i * 2,
      e.konum.x + g.yukari.x * icMesafe,
      e.konum.y + g.yukari.y * icMesafe,
      e.konum.z + g.yukari.z * icMesafe,
    );
    yaz(
      bas + i * 2 + 1,
      e.konum.x + g.yukari.x * disMesafe,
      e.konum.y + g.yukari.y * disMesafe,
      e.konum.z + g.yukari.z * disMesafe,
    );
  }
}

function kuyrukYaz(g: Govde, yaz: Yazici): void {
  const { tur, bolum } = g;
  const son = g.eklemler[g.eklemler.length - 1]!;
  const oncesi = g.eklemler[g.eklemler.length - 2] ?? son;

  // Kuyruk gövdeden gecikmeli savrulur ve salınımı gövde dalgasından belirgin
  // biçimde güçlüdür: itiş buradan geliyor (carangiform yüzme).
  _geri.subVectors(son.konum, oncesi.konum).normalize();
  const gecikme =
    Math.sin(g.faz - tur.dalgaBoyu * Math.PI * 2 - 0.6) * tur.dalgaGenligi * 4.5;
  _geri.applyAxisAngle(g.yukari, gecikme).normalize();

  const boy = tur.kuyrukBoyu * g.boy;
  const yuk = tur.kuyrukYuksekligi * g.boy;
  const catal = tur.kuyrukCatali * boy;

  const kokX = son.konum.x;
  const kokY = son.konum.y;
  const kokZ = son.konum.z;
  const ucX = kokX + _geri.x * boy;
  const ucY = kokY + _geri.y * boy;
  const ucZ = kokZ + _geri.z * boy;

  yaz(bolum.kuyrukBas, kokX, kokY, kokZ);
  yaz(
    bolum.kuyrukBas + 1,
    ucX + g.yukari.x * yuk,
    ucY + g.yukari.y * yuk,
    ucZ + g.yukari.z * yuk,
  );
  yaz(
    bolum.kuyrukBas + 2,
    ucX - _geri.x * catal,
    ucY - _geri.y * catal,
    ucZ - _geri.z * catal,
  );
  yaz(
    bolum.kuyrukBas + 3,
    ucX - g.yukari.x * yuk,
    ucY - g.yukari.y * yuk,
    ucZ - g.yukari.z * yuk,
  );
}

function gogusYaz(g: Govde, yaz: Yazici): void {
  const ayar = g.tur.gogusYuzgeci!;
  const n = g.eklemler.length - 1;
  const indeks = Math.max(1, Math.round(ayar.konum * n));
  const e = g.eklemler[indeks]!;
  const boy = ayar.boy * g.boy;
  const yariCap = profilOku(g.tur.genislikProfili, indeks / n) * g.boy;

  _sag.crossVectors(e.ileri, g.yukari).normalize();
  const cirp = Math.sin(g.faz * 0.8) * 0.3;

  for (let taraf = 0; taraf < 2; taraf++) {
    const isaret = taraf === 0 ? 1 : -1;
    const b = g.bolum.gogusBas + taraf * 4;
    const kokX = e.konum.x + _sag.x * yariCap * (g.tur.yanalBasiklik ?? YANAL_BASIKLIK) * isaret;
    const kokY = e.konum.y + _sag.y * yariCap * (g.tur.yanalBasiklik ?? YANAL_BASIKLIK) * isaret;
    const kokZ = e.konum.z + _sag.z * yariCap * (g.tur.yanalBasiklik ?? YANAL_BASIKLIK) * isaret;

    // Yüzgeç geriye ve dışa doğru açılır, yavaşça çırpar.
    const disX = _sag.x * isaret * Math.cos(cirp) + g.yukari.x * Math.sin(cirp);
    const disY = _sag.y * isaret * Math.cos(cirp) + g.yukari.y * Math.sin(cirp);
    const disZ = _sag.z * isaret * Math.cos(cirp) + g.yukari.z * Math.sin(cirp);
    const geriX = -e.ileri.x;
    const geriY = -e.ileri.y;
    const geriZ = -e.ileri.z;

    yaz(b, kokX, kokY, kokZ);
    yaz(b + 1, kokX + disX * boy * 0.5, kokY + disY * boy * 0.5, kokZ + disZ * boy * 0.5);
    yaz(
      b + 2,
      kokX + disX * boy * 0.6 + geriX * boy,
      kokY + disY * boy * 0.6 + geriY * boy,
      kokZ + disZ * boy * 0.6 + geriZ * boy,
    );
    yaz(b + 3, kokX + geriX * boy * 0.7, kokY + geriY * boy * 0.7, kokZ + geriZ * boy * 0.7);
  }
}

/** Ağzın bulunduğu nokta — yeme kontrolü gövdenin ortasından değil buradan yapılır. */
/**
 * Yenebilirlik vurgusunu uygular.
 *
 * `hedef` > 0: balık yenebilir ve ağza yaklaşıyor — sıcak bir parlama alıyor.
 * `hedef` < 0: yaklaşıyor ama çok büyük — kararıp sisin içine çekiliyor gibi.
 *
 * Bunu **oyuncu balığına uygulamıyoruz**, yalnızca NPC'lere. Eşik kontrolü var:
 * malzeme her karede değil, görünür bir fark oluşunca güncelleniyor.
 *
 * Not: `emissive` değerleri bilerek lineer uzayda veriliyor (sahne renkleri gibi
 * sRGB'den çevrilmiyorlar) — küçük katkılar ve doğrudan ışık gibi davranmaları gerekiyor.
 */
export function govdeVurgusuAyarla(g: Govde, hedef: number): void {
  const v = Math.max(-1, Math.min(1, hedef));
  if (Math.abs(v - g.vurgu) < 0.015) return;
  g.vurgu = v;
  const m = g.mesh.material as MeshStandardMaterial;
  if (v > 0) {
    m.emissive.setRGB(0.5 * v, 0.42 * v, 0.16 * v);
    m.color.setScalar(1);
  } else {
    m.emissive.setRGB(0, 0, 0);
    // v negatif: 0 -> 1.0, -1 -> 0.5
    m.color.setScalar(1 + v * 0.5);
  }
}

/** Isırma animasyonunu baştan oynatır — yem yendiği anda çağrılıyor. */
export function isirmaBaslat(g: Govde): void {
  g.isirma = 0;
}

export function agizNoktasi(g: Govde, hedef: { x: number; y: number; z: number }): void {
  const bas = g.eklemler[0]!;
  const ileri = profilOku(g.tur.genislikProfili, 0) * g.boy * 0.95;
  hedef.x = bas.konum.x + bas.ileri.x * ileri;
  hedef.y = bas.konum.y + bas.ileri.y * ileri;
  hedef.z = bas.konum.z + bas.ileri.z * ileri;
}

export function govdeSerbestBirak(g: Govde): void {
  g.geometri.dispose();
  (g.mesh.material as MeshStandardMaterial).dispose();
}
