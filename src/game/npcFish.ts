import { Vector3 } from "three";
import type { Scene } from "three";
import { aralik, tamAralik } from "../core/rng";
import { GENISLIK, Z_GENISLIK, dipCizgisi, kumYuksekligi, sinirla } from "../core/dunya";
import { izgaraOlustur } from "../core/izgara";
import type { Govde } from "../render/fish3d";
import { govdeGuncelle, govdeOlustur, govdeSerbestBirak } from "../render/fish3d";
import type { Gida } from "./food";
import { gidayiTuket } from "./food";
import type { Kuvvet, Ortam, SuruBirey } from "./school";
import { etkinlik, hiziSinirla, komsuYaricapi, kuvvetHesapla, yemYaricapi } from "./school";
import type { Tur } from "./species";
import { TURLER } from "./species";

/**
 * Resifin sakinleri.
 *
 * Her birey aynı prosedürel gövde sistemiyle çiziliyor; tür farkı sadece parametre.
 * Hareket `school.ts` içindeki kuvvetlerden geliyor — burası popülasyonu yönetip
 * kuvvetleri konuma çeviriyor ve mesh'leri sahneye ekliyor.
 *
 * 2B sürümdeki sahte `derinlik` alanı kalktı: artık gerçek bir z koordinatı var,
 * perspektif ve sis işi kendiliğinden hallediyor.
 */
export interface NpcBalik extends SuruBirey {
  govde: Govde;
  /** Bakış yönü (birim vektör). */
  readonly ileri: Vector3;
  /** Bu balığın yediği gıda sayısı — ekosistemin işlediğini ölçmek için. */
  yedigi: number;
}

/**
 * Resifteki toplam birey sayısı.
 *
 * Tür sayısı 8'den 20'ye çıkınca 58 birey yetmemeye başladı: garanti doğan tekil
 * türler (orkinos, orfoz, kalkan, lahoz…) kotanın yarısını yiyor, geriye sürülere
 * az yer kalıyordu ve resif boş görünüyordu.
 *
 * Resif 4,03 kat büyüyünce 88 birey aynı sebeple yetersiz kaldı. Alanla birebir
 * ölçeklemek 355 birey demek olurdu; buna gerek yok çünkü **balıklar kümeleniyor** —
 * açık kumluğun boş olması doğru, sürünün içine girdiğinde kalabalık olması yeterli.
 * 2,4 kat (215) ile sürü büyüklükleri korunup sürü sayısı artıyor.
 */
function hedefSayi(): number {
  return 215;
}

function turSec(): Tur {
  const toplam = TURLER.reduce((t, s) => t + s.agirlik, 0);
  let n = Math.random() * toplam;
  for (const tur of TURLER) {
    n -= tur.agirlik;
    if (n <= 0) return tur;
  }
  return TURLER[0]!;
}

function bireyOlustur(tur: Tur, x: number, y: number, z: number): NpcBalik {
  const boy = aralik(tur.boy[0], tur.boy[1]);
  const aci = Math.random() * Math.PI * 2;
  return {
    x,
    y,
    z,
    vx: Math.cos(aci) * tur.hiz * 0.5,
    vy: 0,
    vz: Math.sin(aci) * tur.hiz * 0.5,
    tur,
    boy,
    gezinmeAci: aci,
    gezinmeEgim: 0,
    tercihDerinlik: aralik(tur.derinlik[0], tur.derinlik[1]),
    hedefGida: null,
    govde: govdeOlustur(tur.gorunum, boy, x, y, z, aci),
    ileri: new Vector3(Math.cos(aci), 0, Math.sin(aci)),
    yedigi: 0,
  };
}

/** Bir grup (sürü) doğurur — tür tablosundaki grup boyu kadar birey, bir arada. */
function grupDogur(liste: NpcBalik[], sahne: Scene, tur: Tur): void {
  const dip = dipCizgisi();
  const merkezX = aralik(40, GENISLIK - 40);
  const merkezZ = aralik(40, Z_GENISLIK - 40);
  const merkezY = aralik(tur.derinlik[0], tur.derinlik[1]) * dip;
  const sayi = tamAralik(tur.grupBoyu[0], tur.grupBoyu[1]);
  const yayilma = 8 + sayi * 1.8;

  for (let i = 0; i < sayi; i++) {
    const x = sinirla(merkezX + aralik(-yayilma, yayilma), 10, GENISLIK - 10);
    const z = sinirla(merkezZ + aralik(-yayilma, yayilma), 10, Z_GENISLIK - 10);
    const y = sinirla(merkezY + aralik(-yayilma, yayilma) * 0.6, 16, kumYuksekligi(x, z) - 8);
    const birey = bireyOlustur(tur, x, y, z);
    liste.push(birey);
    sahne.add(birey.govde.mesh);
  }
}

export function baslangicNpcleri(sahne: Scene): NpcBalik[] {
  const liste: NpcBalik[] = [];

  // **Her türden en az bir grup.** Ağırlıklı kura tek başına bırakılınca kalabalık
  // sürüler (hamsi, izmarit) kotayı hızla doldurup geri kalanı dışarıda bırakıyordu:
  // 20 türün ancak 13'ü sahneye çıkıyor, orkinos veya zargana hiç görünmüyordu.
  // Tür sayısı arttıkça kuranın varyansı da arttığı için garanti tek çözüm.
  for (const tur of TURLER) grupDogur(liste, sahne, tur);

  let guvenlik = 0;
  while (liste.length < hedefSayi() && guvenlik++ < 200) grupDogur(liste, sahne, turSec());
  return liste;
}

const _kuvvet: Kuvvet = { x: 0, y: 0, z: 0 };

/**
 * Komşu ve yem aramasının uzamsal ızgaraları.
 *
 * Hücre boyu iki uçtan sıkışıyor: küçültünce sorgu başına taranan hücre sayısı, büyütünce
 * hücre başına düşen aday sayısı artıyor. 90 birim, en kalabalık sorgunun (hamsi, 75
 * birim yarıçap) 3 × 3 hücreye denk gelmesini sağlıyor. Yem ızgarası daha ince: yem
 * nesneleri küçük ve sorgu menzili balık boyuyla değişiyor.
 */
const _balikIzgarasi = izgaraOlustur<NpcBalik>(GENISLIK, Z_GENISLIK, 90);
const _gidaIzgarasi = izgaraOlustur<Gida>(GENISLIK, Z_GENISLIK, 60);
const _komsular: NpcBalik[] = [];
const _gidaAdaylari: Gida[] = [];

export function npcleriGuncelle(
  liste: NpcBalik[],
  ortam: Ortam,
  gidalar: Gida[],
  dt: number,
): void {
  _balikIzgarasi.yenile(liste);
  _gidaIzgarasi.yenile(gidalar);

  for (const b of liste) {
    _balikIzgarasi.sorgula(b.x, b.z, komsuYaricapi(b.boy), _komsular);
    _gidaIzgarasi.sorgula(b.x, b.z, yemYaricapi(b.boy), _gidaAdaylari);
    const kuvvet = kuvvetHesapla(b, _komsular, _gidaAdaylari, ortam, dt, _kuvvet);

    b.vx += kuvvet.x * dt;
    b.vy += kuvvet.y * dt;
    b.vz += kuvvet.z * dt;
    // Su direnci — balık ivmeyi bırakınca süzülerek yavaşlar.
    const surtunme = 1 - 1.4 * dt;
    b.vx *= surtunme;
    b.vy *= surtunme;
    b.vz *= surtunme;
    hiziSinirla(b, ortam.gunduzOrani);

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;

    // Kum ve yüzey sert sınır: kuvvetler yetmezse bile içeri girmesin.
    const taban = kumYuksekligi(b.x, b.z) - b.boy * 0.2;
    if (b.y > taban) {
      b.y = taban;
      b.vy = Math.min(0, b.vy);
    }
    if (b.y < 8) {
      b.y = 8;
      b.vy = Math.max(0, b.vy);
    }
    b.x = sinirla(b.x, 6, GENISLIK - 6);
    b.z = sinirla(b.z, 6, Z_GENISLIK - 6);

    // Bakış yönü hıza doğru yumuşak döner; yavaşken son yönünü korur.
    const hiz = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    if (hiz > 1.5) {
      const oran = Math.min(1, 4.5 * dt);
      b.ileri.x += (b.vx / hiz - b.ileri.x) * oran;
      b.ileri.y += (b.vy / hiz - b.ileri.y) * oran;
      b.ileri.z += (b.vz / hiz - b.ileri.z) * oran;
      b.ileri.normalize();
    }

    const hizOrani = Math.min(1, hiz / Math.max(1, b.tur.hiz));
    govdeGuncelle(b.govde, b.x, b.y, b.z, b.ileri, hizOrani, dt);

    // Yem yakalama: dünya oyuncuyu beklemiyor, NPC'ler de besleniyor.
    const hedef = b.hedefGida;
    if (hedef) {
      const dx = hedef.x - b.x;
      const dy = hedef.y - b.y;
      const dz = hedef.z - b.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < b.boy * 0.5 + hedef.tur.yaricap) {
        if (gidayiTuket(gidalar, hedef)) b.yedigi++;
        b.hedefGida = null;
      }
    }
  }
}

/**
 * Oyuncunun yiyebileceği balığın, kendi boyuna oranla üst sınırı.
 *
 * Yavru çipura (13 birim) hiçbir balığı yiyemez — en küçük hamsi bile 9 birim.
 * Büyüdükçe önce hamsi, sonra izmarit ve sarpa menüye giriyor.
 */
const YENEBILIR_ORAN = 0.5;

export function balikBesini(balik: NpcBalik): number {
  return Math.max(2, Math.round(balik.boy * 1.2));
}

/** Ağzıyla temas eden ve yeterince küçük balığı döndürür. */
/**
 * Bu balık verilen boydaki oyuncu tarafından yenebilir mi?
 *
 * Kural tek yerde kalsın diye dışa açıldı: hem yakalama (`yenebilirBalikBul`) hem
 * de görsel vurgu aynı eşiği kullanıyor, yoksa "parlıyor ama yenmiyor" oluyor.
 */
export function yenebilirMi(balikBoyu: number, oyuncuBoyu: number): boolean {
  return balikBoyu <= oyuncuBoyu * YENEBILIR_ORAN;
}

export function yenebilirBalikBul(
  liste: readonly NpcBalik[],
  agiz: { x: number; y: number; z: number },
  agizYaricapi: number,
  oyuncuBoyu: number,
): NpcBalik | null {
  for (const b of liste) {
    if (!yenebilirMi(b.boy, oyuncuBoyu)) continue;
    const dx = b.x - agiz.x;
    const dy = b.y - agiz.y;
    const dz = b.z - agiz.z;
    const yakalama = agizYaricapi + b.boy * 0.45;
    if (dx * dx + dy * dy + dz * dz <= yakalama * yakalama) return b;
  }
  return null;
}

export function balikYe(liste: NpcBalik[], sahne: Scene, balik: NpcBalik): boolean {
  const indeks = liste.indexOf(balik);
  if (indeks < 0) return false;
  liste.splice(indeks, 1);
  sahne.remove(balik.govde.mesh);
  govdeSerbestBirak(balik.govde);
  return true;
}

/** Yenen/eksilen balıkların yerine zamanla yeni sürüler gelir. */
export function populasyonuTazele(liste: NpcBalik[], sahne: Scene, dt: number): void {
  if (liste.length >= hedefSayi()) return;
  // Saniyede %12 olasılıkla yeni bir grup: boşluk anında değil, yavaşça dolsun.
  if (Math.random() < 0.12 * dt) grupDogur(liste, sahne, turSec());
}

/** Evre atlandığında kutlamaya katılan bir sürü ekler. */
export function npcSuruEkle(liste: NpcBalik[], sahne: Scene): void {
  const suruTurleri = TURLER.filter((t) => t.suruEgilimi > 0.5);
  const tur = suruTurleri[Math.floor(Math.random() * suruTurleri.length)] ?? TURLER[0]!;
  grupDogur(liste, sahne, tur);
  while (liste.length > hedefSayi() * 1.5) {
    const kurban = liste[0]!;
    liste.splice(0, 1);
    sahne.remove(kurban.govde.mesh);
    govdeSerbestBirak(kurban.govde);
  }
}

export { etkinlik };
