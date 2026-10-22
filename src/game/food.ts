import {
  BufferGeometry,
  SRGBColorSpace,
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  SphereGeometry,
  TorusKnotGeometry,
  Vector3,
} from "three";
import { aralik, sans } from "../core/rng";
import {
  ALAN_CARPANI,
  GENISLIK,
  YUKSEKLIK,
  Z_GENISLIK,
  dipCizgisi,
  dunyaKonumu,
  kumYuksekligi,
} from "../core/dunya";
import type { Renk } from "../render/shapes";
import type { IsikDurumu } from "./daynight";

export type GidaAdi =
  | "plankton"
  | "yosun"
  | "karides"
  | "solucan"
  | "denizyildizi"
  | "denizanasi";

type Habitat = "suSutunu" | "cayir" | "kum" | "kumIci" | "dip";

export interface GidaTuru {
  readonly ad: GidaAdi;
  readonly etiket: string;
  readonly besin: number;
  /** Bu gıdayı yiyebilmek için gereken en küçük evre indeksi. */
  readonly minEvre: number;
  readonly agirlik: number;
  readonly habitat: Habitat;
  readonly yaricap: number;
  /** Gece bollaşma çarpanı (karides gece çıkar). */
  readonly geceArtisi: number;
  readonly renk: Renk;
}

export const GIDA_TURLERI: readonly GidaTuru[] = [
  { ad: "plankton", etiket: "Plankton", besin: 1, minEvre: 0, agirlik: 44, habitat: "suSutunu", yaricap: 2.4, geceArtisi: 1.6, renk: [170, 240, 180] },
  { ad: "yosun", etiket: "Yosun", besin: 3, minEvre: 0, agirlik: 22, habitat: "cayir", yaricap: 3, geceArtisi: 1, renk: [92, 178, 110] },
  { ad: "karides", etiket: "Karides", besin: 8, minEvre: 1, agirlik: 13, habitat: "kum", yaricap: 3.4, geceArtisi: 2.4, renk: [240, 152, 126] },
  { ad: "solucan", etiket: "Solucan", besin: 15, minEvre: 1, agirlik: 8, habitat: "kumIci", yaricap: 3.2, geceArtisi: 1.8, renk: [222, 116, 138] },
  { ad: "denizyildizi", etiket: "Denizyıldızı", besin: 30, minEvre: 2, agirlik: 6, habitat: "dip", yaricap: 4.5, geceArtisi: 1, renk: [236, 148, 70] },
  { ad: "denizanasi", etiket: "Denizanası", besin: 60, minEvre: 3, agirlik: 4, habitat: "suSutunu", yaricap: 5, geceArtisi: 1.3, renk: [186, 150, 234] },
];

export interface Gida {
  tur: GidaTuru;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  faz: number;
  hamleSuresi: number;
  hedefY: number;
  olcek: number;
}

/**
 * Sahnedeki gıda nesnesi sayısı.
 *
 * Alanla ölçekleniyor ama birebir değil: 600 × 400'lük resifteki 60 nesnenin yoğunluğu
 * korunsaydı 242 olurdu. 50'lik katsayı yoğunluğu %83'e çekiyor — büyüyen resifte yemi
 * **aramak** gerekmesi istenen bir şey, üstelik oyuncunun menüsünde artık 215 balık da var.
 */
function hedefSayi(): number {
  return Math.round(50 * ALAN_CARPANI);
}

/**
 * Planktonun tercih ettiği derinlik gün içinde değişir: gündüz derine iner, gece
 * yüzeye çıkar. Bu gerçek bir olay (diel dikey göç) ve oyunda doğrudan hissediliyor —
 * gece beslenmek için yukarı çıkmak gerekiyor.
 */
function planktonDerinligi(isik: IsikDurumu): number {
  const gunduz = isik.gunduzOrani;
  return aralik(0.12 + gunduz * 0.42, 0.45 + gunduz * 0.38);
}

function turSec(isik: IsikDurumu): GidaTuru {
  const geceligi = 1 - isik.gunduzOrani;
  const agirliklar = GIDA_TURLERI.map((t) => t.agirlik * (1 + (t.geceArtisi - 1) * geceligi));
  const toplam = agirliklar.reduce((a, b) => a + b, 0);
  let n = Math.random() * toplam;
  for (let i = 0; i < GIDA_TURLERI.length; i++) {
    n -= agirliklar[i]!;
    if (n <= 0) return GIDA_TURLERI[i]!;
  }
  return GIDA_TURLERI[0]!;
}

function gidaOlustur(tur: GidaTuru, isik: IsikDurumu): Gida {
  const x = aralik(15, GENISLIK - 15);
  const z = aralik(15, Z_GENISLIK - 15);
  const dip = dipCizgisi();
  let y: number;

  switch (tur.habitat) {
    case "suSutunu":
      y = (tur.ad === "plankton" ? planktonDerinligi(isik) : aralik(0.35, 0.92)) * dip;
      break;
    case "cayir":
      y = kumYuksekligi(x, z) - aralik(4, 26);
      break;
    case "kum":
      y = kumYuksekligi(x, z) - aralik(2, 7);
      break;
    case "kumIci":
    case "dip":
      y = kumYuksekligi(x, z) - aralik(1, 4);
      break;
  }

  return {
    tur,
    x,
    y,
    z,
    vx: aralik(-4, 4),
    vy: tur.ad === "denizanasi" ? aralik(-5, -2) : aralik(-1.5, 1.5),
    vz: aralik(-4, 4),
    faz: aralik(0, Math.PI * 2),
    hamleSuresi: aralik(0.5, 2.5),
    hedefY: 0,
    olcek: aralik(0.85, 1.2),
  };
}

export function baslangicGidalari(isik: IsikDurumu): Gida[] {
  const gidalar: Gida[] = [];
  for (let i = 0; i < hedefSayi(); i++) gidalar.push(gidaOlustur(turSec(isik), isik));
  return gidalar;
}

export interface Konum {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function gidalariGuncelle(
  gidalar: Gida[],
  oyuncu: Konum,
  isik: IsikDurumu,
  akintiX: number,
  akintiY: number,
  akintiZ: number,
  dt: number,
): void {
  const dip = dipCizgisi();

  for (const g of gidalar) {
    g.faz += dt;

    switch (g.tur.habitat) {
      case "suSutunu": {
        if (g.tur.ad === "plankton") {
          g.hedefY = planktonDerinligi(isik) * dip;
          const yon = Math.sign(g.hedefY - g.y);
          g.vy += (yon * 2.4 - g.vy) * 0.7 * dt;
          g.x += (g.vx * 0.3 + akintiX) * dt;
          g.z += (g.vz * 0.3 + akintiZ) * dt;
          g.y += (g.vy + Math.sin(g.faz * 0.9) * 1.6) * dt;
        } else {
          // Denizanası kendi ritminde kasılıp yükselir, akıntıyla sürüklenir.
          const nabiz = Math.max(0, Math.sin(g.faz * 1.6));
          g.x += (g.vx * 0.4 + akintiX) * dt;
          g.z += (g.vz * 0.4 + akintiZ) * dt;
          g.y += (g.vy * (0.4 + nabiz) + akintiY * 0.5) * dt;
        }
        break;
      }

      case "cayir":
        g.x += (g.vx * 0.4 + akintiX * 0.8) * dt;
        g.z += (g.vz * 0.4 + akintiZ * 0.8) * dt;
        g.y += (Math.sin(g.faz * 1.4) * 2 + akintiY * 0.4) * dt;
        break;

      case "kum": {
        // Karides: oyuncu yaklaşınca ani kaçış hamlesi.
        g.hamleSuresi -= dt;
        const dx = g.x - oyuncu.x;
        const dy = g.y - oyuncu.y;
        const dz = g.z - oyuncu.z;
        const mesafe = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (mesafe < 34 && mesafe > 0.5) {
          const guc = ((1 - mesafe / 34) * 150) / mesafe;
          g.vx += dx * guc * dt;
          g.vy += dy * guc * dt;
          g.vz += dz * guc * dt;
        } else if (g.hamleSuresi <= 0) {
          g.vx = aralik(-22, 22);
          g.vy = aralik(-10, 4);
          g.vz = aralik(-22, 22);
          g.hamleSuresi = aralik(0.9, 2.8);
        }
        const azalt = 1 - 1.8 * dt;
        g.vx *= azalt;
        g.vy *= azalt;
        g.vz *= azalt;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.z += g.vz * dt;
        const taban = kumYuksekligi(g.x, g.z) - 2;
        if (g.y > taban) {
          g.y = taban;
          g.vy = Math.min(0, g.vy);
        }
        break;
      }

      case "kumIci":
        // Solucan kumdan yarıya kadar çıkıp geri çekilir.
        g.y = kumYuksekligi(g.x, g.z) - 2 - Math.abs(Math.sin(g.faz * 0.7)) * 4;
        break;

      case "dip":
        g.y = kumYuksekligi(g.x, g.z) - 2;
        break;
    }

    if (g.x < 4) g.x = 4;
    if (g.x > GENISLIK - 4) g.x = GENISLIK - 4;
    if (g.z < 4) g.z = 4;
    if (g.z > Z_GENISLIK - 4) g.z = Z_GENISLIK - 4;
  }

  for (let i = gidalar.length - 1; i >= 0; i--) {
    const g = gidalar[i]!;
    if (g.y < -20 || g.y > YUKSEKLIK + 20) gidalar.splice(i, 1);
  }

  while (gidalar.length < hedefSayi()) {
    if (!sans(0.5)) break;
    gidalar.push(gidaOlustur(turSec(isik), isik));
  }
}

export interface YemeSonucu {
  readonly tur: GidaTuru;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Ağzıyla temas eden ve evresi yeten gıdaları yer, listeden çıkarır.
 * Evresi yetmeyen gıdaya dokunmak hiçbir şey yapmaz — üstünden geçer.
 */
export function yemeKontrol(
  gidalar: Gida[],
  agiz: Konum,
  agizYaricapi: number,
  evre: number,
): YemeSonucu[] {
  const yenenler: YemeSonucu[] = [];
  for (let i = gidalar.length - 1; i >= 0; i--) {
    const g = gidalar[i]!;
    if (evre < g.tur.minEvre) continue;
    const dx = g.x - agiz.x;
    const dy = g.y - agiz.y;
    const dz = g.z - agiz.z;
    const menzil = agizYaricapi + g.tur.yaricap;
    if (dx * dx + dy * dy + dz * dz <= menzil * menzil) {
      yenenler.push({ tur: g.tur, x: g.x, y: g.y, z: g.z });
      gidalar.splice(i, 1);
    }
  }
  return yenenler;
}

/** NPC balıklar için: diyetine uyan, menzil içindeki en yakın gıda. */
export function enYakinGida(
  gidalar: readonly Gida[],
  x: number,
  y: number,
  z: number,
  menzil: number,
  diyet: readonly GidaAdi[],
): Gida | null {
  let enIyi: Gida | null = null;
  let enIyiMesafe = menzil * menzil;
  for (const g of gidalar) {
    if (!diyet.includes(g.tur.ad)) continue;
    const dx = g.x - x;
    const dy = g.y - y;
    const dz = g.z - z;
    const kare = dx * dx + dy * dy + dz * dz;
    if (kare < enIyiMesafe) {
      enIyiMesafe = kare;
      enIyi = g;
    }
  }
  return enIyi;
}

export function gidayiTuket(gidalar: Gida[], gida: Gida): boolean {
  const indeks = gidalar.indexOf(gida);
  if (indeks < 0) return false;
  gidalar.splice(indeks, 1);
  return true;
}

/** Bir sonraki kilidin açılacağı gıda — HUD ipucu için. */
export function siradakiKilit(evre: number): GidaTuru | null {
  const kilitliler = GIDA_TURLERI.filter((t) => t.minEvre > evre);
  if (kilitliler.length === 0) return null;
  return kilitliler.reduce((a, b) => (a.minEvre <= b.minEvre ? a : b));
}

// ---------------------------------------------------------------------------
// Çizim — tür başına bir InstancedMesh
// ---------------------------------------------------------------------------

/**
 * Altmış gıda nesnesi için altmış mesh çok fazla draw call demek olurdu. Her gıda
 * türü tek bir `InstancedMesh`: altı draw call yetiyor.
 */
export interface GidaCizici {
  /**
   * `agiz` ve `oyuncuBoyu` yenebilirlik vurgusu için: ağza yaklaşan yenebilir
   * yem büyüyüp parlıyor, evre kilidi yüzünden yenemeyecek olan küçük ve sönük kalıyor.
   */
  guncelle(
    gidalar: readonly Gida[],
    evre: number,
    agiz: { x: number; y: number; z: number },
    oyuncuBoyu: number,
  ): void;
  serbestBirak(): void;
}

function turGeometrisi(ad: GidaAdi): BufferGeometry {
  switch (ad) {
    case "plankton":
      return new SphereGeometry(1, 6, 4);
    case "yosun":
      return new IcosahedronGeometry(1, 0);
    case "karides":
      return new IcosahedronGeometry(1, 0);
    case "solucan":
      return new TorusKnotGeometry(0.7, 0.26, 24, 5);
    case "denizyildizi":
      return new TorusKnotGeometry(0.8, 0.3, 20, 5, 2, 5);
    case "denizanasi":
      return new SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  }
}

export function gidaCiziciKur(sahne: Scene): GidaCizici {
  const meshler = new Map<GidaAdi, InstancedMesh>();
  // setRGB varsayılan olarak lineer uzay bekler; tablodaki değerler sRGB.
  const turRengi = (t: GidaTuru) =>
    renk.setRGB(t.renk[0] / 255, t.renk[1] / 255, t.renk[2] / 255, SRGBColorSpace);
  const renk = new Color();

  for (const tur of GIDA_TURLERI) {
    const geometri = turGeometrisi(tur.ad);
    // Plankton kendinden ışıklı görünsün; ötekiler ortam ışığından etkilensin.
    const malzeme =
      tur.ad === "plankton"
        ? new MeshBasicMaterial({ color: turRengi(tur).getHex() })
        : new MeshStandardMaterial({
            color: turRengi(tur).getHex(),
            roughness: 0.7,
            metalness: 0.05,
            transparent: tur.ad === "denizanasi",
            opacity: tur.ad === "denizanasi" ? 0.55 : 1,
          });
    const mesh = new InstancedMesh(geometri, malzeme, hedefSayi());
    mesh.count = 0;
    mesh.frustumCulled = false;
    sahne.add(mesh);
    meshler.set(tur.ad, mesh);
  }

  const konum = new Vector3();
  const olcek = new Vector3();
  const donus = new Quaternion();
  const matris = new Matrix4();
  // Kilitli gıdayı görünür ama erişilemez tutmak için küçültüp söndürüyoruz.
  const sayaclar = new Map<GidaAdi, number>();
  const vurguRengi = new Color();

  return {
    guncelle(gidalar, evre, agiz, oyuncuBoyu) {
      for (const ad of meshler.keys()) sayaclar.set(ad, 0);

      // Vurgunun başladığı mesafe: balık boyuna oranlı. Ağız yarıçapına oranlamak
      // (boy * 0.17) menzili bir balık boyundan kısa bırakıyordu — vurgu ancak
      // yem zaten yenirken görünüyordu, yani hiçbir işe yaramıyordu.
      const vurguMenzili = oyuncuBoyu * 1.6;

      for (const g of gidalar) {
        const mesh = meshler.get(g.tur.ad)!;
        const i = sayaclar.get(g.tur.ad)!;
        if (i >= mesh.instanceMatrix.count) continue;

        dunyaKonumu(g.x, g.y, g.z, konum);
        const kilitli = evre < g.tur.minEvre;

        // Yakınlık 0..1; kare alınarak yalnızca gerçekten yaklaşınca belirginleşiyor.
        const dx = g.x - agiz.x;
        const dy = g.y - agiz.y;
        const dz = g.z - agiz.z;
        const uzaklik = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const yakinlik = Math.max(0, 1 - uzaklik / vurguMenzili) ** 2;

        const boyut =
          g.tur.yaricap * g.olcek * (kilitli ? 0.6 : 1 + yakinlik * 0.4);
        olcek.set(boyut, boyut, boyut);

        // Kilitli olan sönük; yenebilir olan yaklaştıkça parlıyor.
        const parlaklik = kilitli ? 0.45 : 1 + yakinlik * 1.1;
        vurguRengi.setScalar(parlaklik);
        mesh.setColorAt(i, vurguRengi);
        donus.setFromAxisAngle(
          new Vector3(0.3, 1, 0.2).normalize(),
          g.faz * (g.tur.habitat === "kum" ? 1.4 : 0.35),
        );
        matris.compose(konum, donus, olcek);
        mesh.setMatrixAt(i, matris);
        sayaclar.set(g.tur.ad, i + 1);
      }

      for (const [ad, mesh] of meshler) {
        mesh.count = sayaclar.get(ad) ?? 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    },

    serbestBirak() {
      for (const mesh of meshler.values()) {
        sahne.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as MeshStandardMaterial).dispose();
      }
      meshler.clear();
    },
  };
}
