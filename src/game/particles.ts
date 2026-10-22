import {
  AdditiveBlending,
  SRGBColorSpace,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Points,
  PointsMaterial,
  Scene,
} from "three";
import { aralik, sans, tamAralik } from "../core/rng";
import { GENISLIK, YUKSEKLIK, Z_GENISLIK, dunyaKonumu, kumYuksekligi, sinirla } from "../core/dunya";
import type { Renk } from "../render/shapes";
import { Vector3 } from "three";

/**
 * Üç tür parçacık, üçü de tek bir `Points` nesnesi (üç draw call):
 *  - kabarcık: yükselen, yükseldikçe hızlanan küreler,
 *  - deniz karı: askıdaki toz — suyun "dolu" görünmesini sağlayan asıl şey,
 *  - kıvılcım: yeme ve evre atlama efektleri.
 *
 * ### Neden parçacıklar oyuncunun etrafında dolaşıyor
 *
 * Kar ve kabarcık eskiden resif hacmine eşit dağılıyordu. Resif 4 kat büyüyünce aynı
 * 900 tanecik görünür yoğunluğu dörtte birine düşürdü — su boşaldı. Sayıyı dörde
 * katlamak yerine parçacıklar **oyuncuyu izleyen bir kutuda** tutuluyor: kutudan çıkan
 * tanecik karşı kenardan giriyor. Görünür yoğunluk resif boyutundan bağımsız, maliyet
 * sabit. Tanecikler 190 birimde zaten yarım pikselden küçük olduğu için kutunun kenarı
 * fark edilmiyor.
 */

const KABARCIK = 300;
const KAR = 1500;
const KIVILCIM = 320;

/** Karın oyuncuyu izleyen kutusunun yarı boyu (yatay / dikey). */
const KAR_YATAY = 190;
const KAR_DIKEY = 150;
/** Kabarcıklar bu yarıçap içindeki kumdan kalkıyor. */
const KABARCIK_YARICAP = 170;

/** Kutudan çıkan tanecik karşı kenardan girer. */
function sar(deger: number, merkez: number, yaricap: number): number {
  const fark = deger - merkez;
  if (fark > yaricap) return deger - yaricap * 2;
  if (fark < -yaricap) return deger + yaricap * 2;
  return deger;
}

interface Tanecik {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  faz: number;
  omur: number;
  toplamOmur: number;
}

/** Parçacık kutusunun izlediği nokta (oyuncu). */
export interface Merkez {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Parcaciklar {
  guncelle(
    merkez: Merkez,
    akintiX: number,
    akintiY: number,
    akintiZ: number,
    dt: number,
  ): void;
  isigiUygula(ortamIsigi: number): void;
  yemeEfekti(x: number, y: number, z: number, renk: Renk): void;
  evreEfekti(x: number, y: number, z: number): void;
  serbestBirak(): void;
}

/**
 * Yuvarlak parçacık dokusu.
 *
 * `PointsMaterial` dokusuz kullanılınca her parçacık **kare** çiziliyor; deniz karı
 * suda yüzen kâğıt parçaları gibi görünüyordu. Küçük bir radyal gradyan dokusu
 * hem yuvarlatıyor hem kenarları yumuşatıyor.
 */
let _noktaDokusu: CanvasTexture | null = null;

function noktaDokusu(): CanvasTexture {
  if (_noktaDokusu) return _noktaDokusu;
  const boyut = 64;
  const canvas = document.createElement("canvas");
  canvas.width = boyut;
  canvas.height = boyut;
  const ctx = canvas.getContext("2d")!;
  const gradyan = ctx.createRadialGradient(boyut / 2, boyut / 2, 0, boyut / 2, boyut / 2, boyut / 2);
  gradyan.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradyan.addColorStop(0.45, "rgba(255, 255, 255, 0.75)");
  gradyan.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradyan;
  ctx.fillRect(0, 0, boyut, boyut);
  _noktaDokusu = new CanvasTexture(canvas);
  return _noktaDokusu;
}

function havuzKur(
  sahne: Scene,
  adet: number,
  boyut: number,
  renk: number,
  opaklik: number,
  toplamali: boolean,
): { points: Points; konumlar: Float32Array; malzeme: PointsMaterial } {
  const konumlar = new Float32Array(adet * 3);
  const geometri = new BufferGeometry();
  geometri.setAttribute("position", new BufferAttribute(konumlar, 3));
  const malzeme = new PointsMaterial({
    color: renk,
    size: boyut,
    map: noktaDokusu(),
    transparent: true,
    opacity: opaklik,
    depthWrite: false,
    sizeAttenuation: true,
  });
  // Kıvılcımlar toplamalı karışımla parlasın; ötekiler normal.
  if (toplamali) malzeme.blending = AdditiveBlending;
  const points = new Points(geometri, malzeme);
  points.frustumCulled = false;
  sahne.add(points);
  return { points, konumlar, malzeme };
}

export function parcacikOlustur(sahne: Scene): Parcaciklar {
  const kabarcikHavuz = havuzKur(sahne, KABARCIK, 1.6, 0xd6f4ff, 0.5, false);
  const karHavuz = havuzKur(sahne, KAR, 0.9, 0xdff2ff, 0.28, false);
  const kivilcimHavuz = havuzKur(sahne, KIVILCIM, 2.4, 0xffe6a0, 0.9, true);

  const _v = new Vector3();

  /** Kabarcık oyuncunun çevresindeki kumdan kalkar. */
  const yeniKabarcik = (merkez: Merkez): Tanecik => {
    const aci = aralik(0, Math.PI * 2);
    const uzaklik = Math.sqrt(Math.random()) * KABARCIK_YARICAP;
    const x = sinirla(merkez.x + Math.cos(aci) * uzaklik, 4, GENISLIK - 4);
    const z = sinirla(merkez.z + Math.sin(aci) * uzaklik, 4, Z_GENISLIK - 4);
    return {
      x,
      y: kumYuksekligi(x, z) - aralik(0, 4),
      z,
      vx: 0,
      vy: -aralik(10, 26),
      vz: 0,
      faz: aralik(0, Math.PI * 2),
      omur: 1,
      toplamOmur: 1,
    };
  };

  const yeniKar = (merkez: Merkez): Tanecik => ({
    x: sinirla(merkez.x + aralik(-KAR_YATAY, KAR_YATAY), 0, GENISLIK),
    y: sinirla(merkez.y + aralik(-KAR_DIKEY, KAR_DIKEY), 0, YUKSEKLIK),
    z: sinirla(merkez.z + aralik(-KAR_YATAY, KAR_YATAY), 0, Z_GENISLIK),
    vx: 0,
    vy: aralik(1.5, 6),
    vz: 0,
    faz: aralik(0, Math.PI * 2),
    omur: 1,
    toplamOmur: 1,
  });

  // Başlangıç dağılımı: oyuncu resifin ortasında doğuyor.
  const baslangic: Merkez = { x: GENISLIK / 2, y: YUKSEKLIK * 0.45, z: Z_GENISLIK / 2 };
  const kabarciklar: Tanecik[] = [];
  for (let i = 0; i < KABARCIK; i++) {
    const k = yeniKabarcik(baslangic);
    // İlk karede hepsi dipte toplanmasın.
    k.y = aralik(0, k.y);
    kabarciklar.push(k);
  }
  const kar: Tanecik[] = [];
  for (let i = 0; i < KAR; i++) kar.push(yeniKar(baslangic));
  const kivilcimlar: Tanecik[] = [];

  /** Ekran dışına gitmiş kıvılcımları gizlemek için uzağa atıyoruz. */
  const UZAK = 1e6;

  function havuzaYaz(konumlar: Float32Array, liste: readonly Tanecik[], adet: number): void {
    for (let i = 0; i < adet; i++) {
      const t = liste[i];
      if (!t) {
        konumlar[i * 3] = UZAK;
        konumlar[i * 3 + 1] = UZAK;
        konumlar[i * 3 + 2] = UZAK;
        continue;
      }
      dunyaKonumu(t.x, t.y, t.z, _v);
      konumlar[i * 3] = _v.x;
      konumlar[i * 3 + 1] = _v.y;
      konumlar[i * 3 + 2] = _v.z;
    }
  }

  return {
    guncelle(merkez, akintiX, akintiY, akintiZ, dt) {
      for (const k of kabarciklar) {
        k.faz += dt * 2.4;
        k.y += k.vy * dt;
        k.x += (Math.sin(k.faz) * 6 + akintiX * 0.6) * dt;
        k.z += (Math.cos(k.faz * 0.8) * 5 + akintiZ * 0.6) * dt;
        // Yükseldikçe basınç düşer, kabarcık hızlanır.
        k.vy -= 3 * dt;
        if (k.y < -4) Object.assign(k, yeniKabarcik(merkez));
      }

      // Kar kutusu oyuncuyu izliyor; dikey kutu su sütununun dışına taşmasın diye
      // merkezi sıkıştırılıyor.
      const karMerkeziY = sinirla(merkez.y, KAR_DIKEY, YUKSEKLIK - KAR_DIKEY);
      for (const k of kar) {
        k.faz += dt * 0.6;
        k.x += (Math.sin(k.faz) * 2.5 + akintiX) * dt;
        k.z += (Math.cos(k.faz) * 2.5 + akintiZ) * dt;
        k.y += (k.vy + akintiY * 0.5) * dt;
        k.x = sar(k.x, merkez.x, KAR_YATAY);
        k.z = sar(k.z, merkez.z, KAR_YATAY);
        k.y = sar(k.y, karMerkeziY, KAR_DIKEY);
      }

      for (let i = kivilcimlar.length - 1; i >= 0; i--) {
        const k = kivilcimlar[i]!;
        k.omur -= dt;
        if (k.omur <= 0) {
          kivilcimlar.splice(i, 1);
          continue;
        }
        k.x += k.vx * dt;
        k.y += k.vy * dt;
        k.z += k.vz * dt;
        // Su direnci: hızla yavaşlar ve hafifçe yükselir.
        const azalt = 1 - 2.6 * dt;
        k.vx *= azalt;
        k.vz *= azalt;
        k.vy = k.vy * azalt - 10 * dt;
      }

      havuzaYaz(kabarcikHavuz.konumlar, kabarciklar, KABARCIK);
      havuzaYaz(karHavuz.konumlar, kar, KAR);
      havuzaYaz(kivilcimHavuz.konumlar, kivilcimlar, KIVILCIM);
      kabarcikHavuz.points.geometry.attributes.position!.needsUpdate = true;
      karHavuz.points.geometry.attributes.position!.needsUpdate = true;
      kivilcimHavuz.points.geometry.attributes.position!.needsUpdate = true;
    },

    isigiUygula(ortamIsigi) {
      // Parçacıklar ışıktan etkilenmiyor (Points malzemesi aydınlatılmaz); gece
      // sönük görünsünler diye saydamlıklarını düşürüyoruz.
      kabarcikHavuz.malzeme.opacity = 0.16 + ortamIsigi * 0.36;
      karHavuz.malzeme.opacity = 0.08 + ortamIsigi * 0.22;
    },

    yemeEfekti(x, y, z, renk) {
      kivilcimHavuz.malzeme.color.setRGB(
        renk[0] / 255,
        renk[1] / 255,
        renk[2] / 255,
        SRGBColorSpace,
      );
      // Sayı ve hız bilerek yüksek: 6-10 parçacık, hızlı yüzerken balığın gövdesinin
      // arkasında kalıp hiç fark edilmiyordu.
      const sayi = tamAralik(16, 22);
      for (let i = 0; i < sayi; i++) {
        if (kivilcimlar.length >= KIVILCIM) break;
        const aci = aralik(0, Math.PI * 2);
        const egim = aralik(-1, 1);
        const hiz = aralik(26, 78);
        kivilcimlar.push({
          x,
          y,
          z,
          vx: Math.cos(aci) * hiz,
          vy: egim * hiz * 0.6,
          vz: Math.sin(aci) * hiz,
          faz: 0,
          omur: aralik(0.45, 0.95),
          toplamOmur: 0.95,
        });
      }
    },

    evreEfekti(x, y, z) {
      kivilcimHavuz.malzeme.color.setRGB(1, 0.9, 0.62, SRGBColorSpace);
      for (let i = 0; i < 40; i++) {
        if (kivilcimlar.length >= KIVILCIM) break;
        const aci = aralik(0, Math.PI * 2);
        const egim = aralik(-1, 1);
        const yatay = Math.sqrt(Math.max(0, 1 - egim * egim));
        const hiz = aralik(40, 66);
        kivilcimlar.push({
          x,
          y,
          z,
          vx: Math.cos(aci) * yatay * hiz,
          vy: egim * hiz,
          vz: Math.sin(aci) * yatay * hiz,
          faz: 0,
          omur: aralik(0.7, 1.1),
          toplamOmur: 1.1,
        });
      }
      void sans;
    },

    serbestBirak() {
      for (const havuz of [kabarcikHavuz, karHavuz, kivilcimHavuz]) {
        sahne.remove(havuz.points);
        havuz.points.geometry.dispose();
        havuz.malzeme.dispose();
      }
    },
  };
}
