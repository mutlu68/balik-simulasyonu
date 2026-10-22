import {
  AdditiveBlending,
  SRGBColorSpace,
  BufferAttribute,
  Color,
  DodecahedronGeometry,
  DoubleSide,
  FrontSide,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import type { BufferGeometry, PerspectiveCamera, Scene } from "three";
import {
  ALAN_CARPANI,
  GENISLIK,
  YUKSEKLIK,
  Z_GENISLIK,
  dipCizgisi,
  dunyaKonumu,
  kumEgimi,
  kumYuksekligi,
} from "../core/dunya";
import { tohumluRng } from "../core/rng";
import type { IsikDurumu } from "../game/daynight";
import { genelAkinti } from "../game/current";
import type { Kaya } from "./bitkiler";
import { bitkileriKur } from "./bitkiler";
import { suGolgesiUygula, suUniformlari, suZamaniGuncelle, yuzeyGolgesiUygula } from "./suShader";

/**
 * Resifin sabit dekoru: kum arazisi, kaya çıkıntıları, çakıl, su yüzeyi ve ışık huzmeleri.
 * Bitki örtüsü ayrı bir modülde (`bitkiler.ts`), buradan çağrılıyor.
 *
 * Dekorun tamamı **tohumlu** rastgelelikle üretiliyor: her açılışta aynı koy.
 *
 * ### Neden artık hiçbir şey her karede CPU'da güncellenmiyor
 *
 * Çayır eskiden her karede 2600 matris yeniden kuruyordu. Resif 4 kat büyüyünce bu
 * 9 bin matris demekti. Salınım vertex shader'ına taşındı (`suShader.ts`); burada
 * kare başına kalan iş yalnızca ışık huzmelerinin kameraya dönmesi (16 nesne) ve
 * birkaç uniform.
 */

/** Kayalar tek tek dağılmıyor: çıkıntılar halinde kümeleniyor. */
const KAYA_SAYISI = Math.round(84 * ALAN_CARPANI);
const CAKIL_SAYISI = Math.round(320 * ALAN_CARPANI);
const HUZME_SAYISI = 16;

/**
 * Zemin resiften geniş: kenarı sisin içinde kalsın, düzlemin bittiği yer görünmesin.
 * Bölüm sayısı kare boyu ~11 birim olacak şekilde seçildi; daha kabasında büyük
 * ölçekli sırtlar köşeli çıkıyor.
 */
const ZEMIN_PAYI = 1.9;
const ZEMIN_BOLUM_X = 200;
const ZEMIN_BOLUM_Z = 140;

export interface Ortam {
  guncelle(zaman: number, isik: IsikDurumu): void;
  /** Ölçüm ve geliştirme kancası için dekor özeti. */
  readonly bilgi: {
    readonly kaya: number;
    readonly cakil: number;
    readonly bitki: number;
    readonly bitkiTuru: number;
  };
}

export function ortamKur(sahne: Scene, kamera: PerspectiveCamera): Ortam {
  const rastgele = tohumluRng(20260914);

  zeminKur(sahne, rastgele);
  const kayalar = kayalariKur(sahne, rastgele);
  cakilKur(sahne, rastgele);
  const flora = bitkileriKur(sahne, kayalar);
  const yuzey = yuzeyKur(sahne);
  const huzmeler = huzmeleriKur(sahne, rastgele);

  return {
    bilgi: {
      kaya: kayalar.length,
      cakil: CAKIL_SAYISI,
      bitki: flora.toplam,
      bitkiTuru: flora.turSayisi,
    },

    guncelle(zaman, isik) {
      // Bütün su shader'larını süren tek nokta: bitkilerin salınımı, kaustik ve
      // yüzey pırıltısı buradan besleniyor.
      suZamaniGuncelle(zaman, isik.gunduzOrani, genelAkinti(zaman));

      yuzey.malzeme.color.setRGB(
        isik.yuzeyRengi[0] / 255,
        isik.yuzeyRengi[1] / 255,
        isik.yuzeyRengi[2] / 255,
        SRGBColorSpace,
      );
      yuzey.malzeme.opacity = 0.36 + isik.gunduzOrani * 0.34;

      huzmeler.guncelle(kamera, sahne);
    },
  };
}

// ---------------------------------------------------------------------------
// Kum arazisi
// ---------------------------------------------------------------------------

function zeminKur(sahne: Scene, rastgele: () => number): void {
  const geometri = new PlaneGeometry(
    GENISLIK * ZEMIN_PAYI,
    Z_GENISLIK * ZEMIN_PAYI,
    ZEMIN_BOLUM_X,
    ZEMIN_BOLUM_Z,
  );
  geometri.rotateX(-Math.PI / 2);
  const zeminKonum = geometri.attributes["position"] as BufferAttribute;
  const renkler = new Float32Array(zeminKonum.count * 3);
  const acikKum = new Color(0xd8c398);
  const koyuKum = new Color(0x7a6a4e);
  const yosunlu = new Color(0x74804f);
  const gecici = new Color();
  const nokta = new Vector3();

  for (let i = 0; i < zeminKonum.count; i++) {
    // PlaneGeometry merkezde; simülasyon koordinatına çevirip yüksekliği oradan al.
    const simX = zeminKonum.getX(i) + GENISLIK / 2;
    const simZ = zeminKonum.getZ(i) + Z_GENISLIK / 2;
    const derinlik = kumYuksekligi(simX, simZ);
    dunyaKonumu(simX, derinlik, simZ, nokta);
    zeminKonum.setY(i, nokta.y);

    // Çukurlar koyu, tümsekler açık — araziye okunaklılık veren şey bu. Aralık
    // ortalama dip çizgisine göre **ortalanıyor**: arazinin oynama payı ±46 birime
    // çıkınca sabit bir eşik kumun çoğunu koyu tarafta bırakıyor ve zemin çamurlaşıyordu.
    const oran = Math.max(0, Math.min(1, (derinlik - dipCizgisi()) / 92 + 0.5));
    gecici.copy(acikKum).lerp(koyuKum, oran * 0.7 + rastgele() * 0.12);
    // Dik yamaçlar yosun tutuyor: kum rengi eğime göre yeşile kayıyor. Aynı ipucu
    // bitki yerleşiminde de kullanılıyor, ikisi üst üste düşünce yamaç okunur oluyor.
    // Eşik bitki yerleşimindeki düzlük sınırıyla aynı yerde başlıyor (0,13).
    const egim = Math.max(0, Math.min(1, (kumEgimi(simX, simZ) - 0.13) / 0.22));
    gecici.lerp(yosunlu, egim * 0.42);
    renkler[i * 3] = gecici.r;
    renkler[i * 3 + 1] = gecici.g;
    renkler[i * 3 + 2] = gecici.b;
  }
  geometri.setAttribute("color", new BufferAttribute(renkler, 3));
  geometri.computeVertexNormals();

  const malzeme = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
  });
  // Kum, ışık ağının en okunaklı olduğu yüzey: düz bir zemine hareket veren tek şey.
  suGolgesiUygula(malzeme, { kaustik: 2.4 });
  sahne.add(new Mesh(geometri, malzeme));
}

// ---------------------------------------------------------------------------
// Kayalar ve çakıl
// ---------------------------------------------------------------------------

/** Kaya ve çakılın ortak malzemesi — tek program, örnek başına renk oynaması. */
function tasMalzemesi(): MeshStandardMaterial {
  // Mavi-gri (0x55606a) kaya, mavi sis ve mavi ortam ışığının altında buz gibi
  // görünüyordu. Nötr-sıcak bir taş rengi kumla aynı ailede kalıyor; renk oynaması
  // örnek başına kahverengiye kayarak kaya sahasını tekdüzelikten çıkarıyor.
  const malzeme = new MeshStandardMaterial({
    color: 0x74706a,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.05,
  });
  suGolgesiUygula(malzeme, { kaustik: 1.25 });
  return malzeme;
}

/** `instanceColor`ın uygulanabilmesi için geometride bir renk verisi bulunmalı. */
function beyazRenkVerisiEkle(geometri: BufferGeometry): BufferGeometry {
  const adet = (geometri.attributes["position"] as BufferAttribute).count;
  geometri.setAttribute("color", new BufferAttribute(new Float32Array(adet * 3).fill(1), 3));
  return geometri;
}

function kayalariKur(sahne: Scene, rastgele: () => number): Kaya[] {
  // Üç farklı kaba blok: hepsi aynı on iki yüzlü olunca kaya sahası tekrar ediyor.
  const bicimler = [
    beyazRenkVerisiEkle(new DodecahedronGeometry(1, 0)),
    beyazRenkVerisiEkle(new IcosahedronGeometry(1, 0)),
    beyazRenkVerisiEkle(new DodecahedronGeometry(1, 1)),
  ];
  const malzeme = tasMalzemesi();
  const kayalar: Kaya[] = [];

  // Kayalar **çıkıntı** halinde kümeleniyor. Düzgün dağılımda resif her yerde aynı
  // görünüyor ve yön bulmayı sağlayan bir işaret kalmıyor; öbekler ise uzaktan
  // seçilen birer nirengi oluyor.
  const cikintiSayisi = Math.round(KAYA_SAYISI / 6);
  const merkezler: Array<{ x: number; z: number; yaricap: number }> = [];
  for (let c = 0; c < cikintiSayisi; c++) {
    merkezler.push({
      x: rastgele() * GENISLIK,
      z: rastgele() * Z_GENISLIK,
      yaricap: 22 + rastgele() * 48,
    });
  }

  const gecici: Array<{
    bicim: number;
    konum: Vector3;
    olcek: Vector3;
    donus: Quaternion;
    renk: number;
  }> = [];

  for (let i = 0; i < KAYA_SAYISI; i++) {
    // Her altı kayadan beşi bir çıkıntıya ait, biri tek başına duruyor.
    const merkez = i % 6 === 5 ? null : merkezler[i % merkezler.length]!;
    const aci = rastgele() * Math.PI * 2;
    const uzaklik = merkez ? rastgele() ** 2 * merkez.yaricap : 0;
    const x = merkez ? merkez.x + Math.cos(aci) * uzaklik : rastgele() * GENISLIK;
    const z = merkez ? merkez.z + Math.sin(aci) * uzaklik : rastgele() * Z_GENISLIK;
    if (x < 6 || x > GENISLIK - 6 || z < 6 || z > Z_GENISLIK - 6) continue;

    // Çıkıntının ortasındaki kaya büyük, kenardakiler küçük: öbek bir tepe gibi okunsun.
    const merkezlik = merkez ? 1 - uzaklik / merkez.yaricap : 0.35;
    const boy = 5 + merkezlik * 22 + rastgele() * 10;
    const yatay = boy * (0.85 + rastgele() * 0.6);
    const dikey = boy * (0.5 + rastgele() * 0.45);
    const merkezY = kumYuksekligi(x, z) + boy * 0.25;

    const konum = new Vector3();
    dunyaKonumu(x, merkezY, z, konum);
    gecici.push({
      bicim: i % bicimler.length,
      konum,
      olcek: new Vector3(yatay, dikey, yatay),
      donus: new Quaternion().setFromAxisAngle(
        new Vector3(rastgele(), rastgele(), rastgele()).normalize(),
        rastgele() * 6.3,
      ),
      renk: 0.78 + rastgele() * 0.5,
    });
    kayalar.push({ x, z, merkezY, yatayYaricap: yatay, dikeyYaricap: dikey });
  }

  const matris = new Matrix4();
  const renk = new Color();
  for (let b = 0; b < bicimler.length; b++) {
    const kume = gecici.filter((k) => k.bicim === b);
    if (kume.length === 0) continue;
    const mesh = new InstancedMesh(bicimler[b]!, malzeme, kume.length);
    for (let i = 0; i < kume.length; i++) {
      const k = kume[i]!;
      mesh.setMatrixAt(i, matris.compose(k.konum, k.donus, k.olcek));
      renk.setRGB(k.renk * 1.06, k.renk * 0.99, k.renk * 0.86);
      mesh.setColorAt(i, renk);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    sahne.add(mesh);
  }

  return kayalar;
}

/** Çakıl: kumun üstünde yatan küçük, basık taşlar. Zemine yakından bakılınca ölçek verir. */
function cakilKur(sahne: Scene, rastgele: () => number): void {
  const geometri = beyazRenkVerisiEkle(new IcosahedronGeometry(1, 0));
  const mesh = new InstancedMesh(geometri, tasMalzemesi(), CAKIL_SAYISI);
  const matris = new Matrix4();
  const konum = new Vector3();
  const olcek = new Vector3();
  const donus = new Quaternion();
  const renk = new Color();

  for (let i = 0; i < CAKIL_SAYISI; i++) {
    const x = rastgele() * GENISLIK;
    const z = rastgele() * Z_GENISLIK;
    const boyut = 0.9 + rastgele() ** 2 * 3.4;
    dunyaKonumu(x, kumYuksekligi(x, z) + boyut * 0.25, z, konum);
    olcek.set(boyut * (0.9 + rastgele() * 0.5), boyut * 0.45, boyut * (0.9 + rastgele() * 0.5));
    donus.setFromAxisAngle(new Vector3(rastgele(), rastgele(), rastgele()).normalize(), rastgele() * 6.3);
    mesh.setMatrixAt(i, matris.compose(konum, donus, olcek));
    const ton = 0.72 + rastgele() * 0.62;
    renk.setRGB(ton, ton * 0.96, ton * 0.88);
    mesh.setColorAt(i, renk);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  sahne.add(mesh);
}

// ---------------------------------------------------------------------------
// Su yüzeyi
// ---------------------------------------------------------------------------

function yuzeyKur(sahne: Scene): { malzeme: MeshBasicMaterial } {
  // Bölüm sayısı dalganın yumuşak görünmesi için: tek parça bir levhada köşeler
  // kıpırdayacak bir yer bulamıyor.
  const geometri = new PlaneGeometry(GENISLIK * 1.7, Z_GENISLIK * 1.7, 70, 50);
  geometri.rotateX(Math.PI / 2);
  // **FrontSide, BackSide değil.** `rotateX(π/2)` düzlemin ön yüzünü aşağı çeviriyor;
  // yani alttan bakan oyuncu ön yüzü görüyor. `BackSide` bu yüzü ayıkladığı için yüzey
  // hiç çizilmiyordu — sisi kapatıp bakınca da görünmüyor, hata buradan bulundu.
  // `depthWrite: false`: saydam bir tavanın derinlik yazması, arkasındaki öteki saydam
  // nesneleri (denizanası, huzme) gizleyebiliyor.
  const malzeme = new MeshBasicMaterial({
    color: 0x7fd8f0,
    transparent: true,
    opacity: 0.55,
    side: FrontSide,
    depthWrite: false,
  });
  yuzeyGolgesiUygula(malzeme);
  const yuzey = new Mesh(geometri, malzeme);
  yuzey.position.y = 0;
  sahne.add(yuzey);
  return { malzeme };
}

// ---------------------------------------------------------------------------
// Işık huzmeleri
// ---------------------------------------------------------------------------

const HUZME_VERTEX = /* glsl */ `
varying vec2 vUv;
varying float vMesafe;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  vMesafe = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * Huzme kendi sisini hesaplıyor. Three.js'in sisi rengi **sis rengine doğru
 * karıştırıyor**; toplamalı karışımda bu, uzaktaki huzmelerin sönmek yerine sahneyi
 * beyazlatması demek. Burada mesafeyle doğrudan sönüyor.
 */
const HUZME_FRAGMENT = /* glsl */ `
uniform vec3 uRenk;
uniform float uSiddet;
uniform float uFaz;
uniform float uZaman;
uniform float uGunduz;
uniform float uSis;
varying vec2 vUv;
varying float vMesafe;
void main() {
  float yatay = smoothstep( 0.0, 0.45, vUv.x ) * smoothstep( 1.0, 0.55, vUv.x );
  // uv.y = 1 yüzeyde, 0 derinde: huzme yukarıda güçlü, inerken dağılıyor. Üst uç da
  // sönüyor, yoksa levhanın yüzeyle kesiştiği yerde keskin bir kenar görünüyor.
  float dikey = smoothstep( 0.0, 0.6, vUv.y ) * smoothstep( 1.0, 0.88, vUv.y ) * ( 0.2 + vUv.y * 0.8 );
  float kirpisma = 0.7 + 0.3 * sin( uZaman * 0.5 + uFaz );
  float guc = yatay * dikey * kirpisma * uSiddet * uGunduz * exp( -vMesafe * uSis );
  gl_FragColor = vec4( uRenk * guc, guc );
}
`;

function huzmeleriKur(
  sahne: Scene,
  rastgele: () => number,
): { guncelle(kamera: PerspectiveCamera, sahne: Scene): void } {
  const geometri = new PlaneGeometry(1, 1, 1, 1);
  // Üst kenar orijinde: huzme yüzeyden aşağı sarksın.
  geometri.translate(0, -0.5, 0);

  const huzmeler: Mesh[] = [];
  for (let i = 0; i < HUZME_SAYISI; i++) {
    const malzeme = new ShaderMaterial({
      uniforms: {
        uRenk: { value: new Color(0xbfeaff) },
        uSiddet: { value: 0.32 + rastgele() * 0.3 },
        uFaz: { value: rastgele() * 6.3 },
        uZaman: suUniformlari.uZaman,
        uGunduz: suUniformlari.uGunduz,
        uSis: { value: 0.0034 },
      },
      vertexShader: HUZME_VERTEX,
      fragmentShader: HUZME_FRAGMENT,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
    });
    const mesh = new Mesh(geometri, malzeme);
    const x = rastgele() * GENISLIK;
    const z = rastgele() * Z_GENISLIK;
    const konum = new Vector3();
    dunyaKonumu(x, 0, z, konum);
    mesh.position.copy(konum);
    mesh.scale.set(26 + rastgele() * 46, YUKSEKLIK * (0.45 + rastgele() * 0.4), 1);
    mesh.renderOrder = 2;
    huzmeler.push(mesh);
    sahne.add(mesh);
  }

  return {
    guncelle(kamera, sahneRef) {
      // Sis yoğunluğu gece artıyor; huzmeler onunla birlikte kısalmalı, yoksa gece
      // sisin içinden tam parlaklıkta geçiyorlar.
      const sis = sahneRef.fog && "density" in sahneRef.fog ? sahneRef.fog.density : 0.0034;
      for (const huzme of huzmeler) {
        // Tek yönlü (billboard) dönüş: huzme her zaman kameraya bakan bir levha.
        huzme.rotation.y = Math.atan2(
          kamera.position.x - huzme.position.x,
          kamera.position.z - huzme.position.z,
        );
        (huzme.material as ShaderMaterial).uniforms["uSis"]!.value = sis * 1.35;
      }
    },
  };
}
