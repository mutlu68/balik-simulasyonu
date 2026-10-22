import type { Girdi } from "../core/input";
import { govdeVurgusuAyarla, isirmaBaslat } from "../render/fish3d";
import type { Sahne } from "../render/sahne";
import { ortamKur } from "../render/environment";
import type { Ortam as OrtamDekoru } from "../render/environment";
import type { HudDurumu } from "../ui/hud";
import {
  duyuruGoster,
  hudCiz,
  hudGuncelle,
  hudOlustur,
  hudSifirla,
  yemeVurgusuGoster,
} from "../ui/hud";
import type { AkintiVektoru } from "./current";
import { akinti } from "./current";
import type { IsikDurumu } from "./daynight";
import { isikHesapla } from "./daynight";
import type { Gida, GidaAdi, GidaCizici } from "./food";
import {
  baslangicGidalari,
  gidaCiziciKur,
  gidalariGuncelle,
  yemeKontrol,
} from "./food";
import { EVRELER, aclikGuncelle, aclikKatkisi, evreIndeksi } from "./growth";
import type { NpcBalik } from "./npcFish";
import {
  balikBesini,
  balikYe,
  baslangicNpcleri,
  npcSuruEkle,
  npcleriGuncelle,
  populasyonuTazele,
  yenebilirBalikBul,
  yenebilirMi,
} from "./npcFish";
import type { Ortam } from "./school";
import type { Parcaciklar } from "./particles";
import { parcacikOlustur } from "./particles";
import type { Oyuncu } from "./player";
import {
  agizNoktasi,
  oyuncuEvresiniAyarla,
  oyuncuGuncelle,
  oyuncuOlustur,
  oyuncuYaricapi,
} from "./player";
import { ilerlemeKaydet } from "./save";
import type { Ilerleme } from "./state";
import { bosIlerleme } from "./state";

/** Kaç saniyede bir kayıt yazılsın. */
const KAYIT_ARALIGI = 3;

export interface Dunya {
  ilerleme: Ilerleme;
  oyuncu: Oyuncu;
  gidalar: Gida[];
  npcler: NpcBalik[];
  parcaciklar: Parcaciklar;
  gidaCizici: GidaCizici;
  dekor: OrtamDekoru;
  hud: HudDurumu;
  isik: IsikDurumu;
  zaman: number;
  kayitSayaci: number;
  readonly sahne: Sahne;
}

export function dunyaOlustur(ilerleme: Ilerleme, sahne: Sahne): Dunya {
  // Kayıttan gelen geçen süre yok; döngü sabahın erken saatinde başlasın.
  const isik = isikHesapla(60);
  const oyuncu = oyuncuOlustur(evreIndeksi(ilerleme.besin));
  sahne.scene.add(oyuncu.govde.mesh);

  return {
    ilerleme,
    oyuncu,
    gidalar: baslangicGidalari(isik),
    npcler: baslangicNpcleri(sahne.scene),
    parcaciklar: parcacikOlustur(sahne.scene),
    gidaCizici: gidaCiziciKur(sahne.scene),
    dekor: ortamKur(sahne.scene, sahne.camera),
    hud: hudOlustur(),
    isik,
    zaman: 60,
    kayitSayaci: 0,
    sahne,
  };
}

/** Sıfırla: ilerleme silinir, oyuncu yavruya döner. Resifin kendisi aynı kalır. */
export function dunyayiSifirla(dunya: Dunya): void {
  dunya.ilerleme = bosIlerleme();
  dunya.sahne.scene.remove(dunya.oyuncu.govde.mesh);
  dunya.oyuncu = oyuncuOlustur(0);
  dunya.sahne.scene.add(dunya.oyuncu.govde.mesh);
  dunya.gidalar = baslangicGidalari(dunya.isik);
  hudSifirla();
  duyuruGoster(dunya.hud, "yeniden başladın");
}

const _akim: AkintiVektoru = { x: 0, y: 0, z: 0 };

export function dunyaGuncelle(dunya: Dunya, girdi: Girdi, dt: number): void {
  dunya.zaman += dt;
  dunya.isik = isikHesapla(dunya.zaman);

  const { ilerleme, oyuncu, isik } = dunya;

  oyuncuEvresiniAyarla(oyuncu, evreIndeksi(ilerleme.besin));
  oyuncuGuncelle(oyuncu, girdi, dt);

  // Akıntı oyuncunun bulunduğu noktada örnekleniyor: tek örnek parçacıklar, gıda ve
  // sürüler için yeterli; her nesne için ayrı hesaplamak gereksiz maliyet.
  akinti(oyuncu.x, oyuncu.y, oyuncu.z, dunya.zaman, _akim);

  const ortam: Ortam = {
    oyuncuX: oyuncu.x,
    oyuncuY: oyuncu.y,
    oyuncuZ: oyuncu.z,
    oyuncuBoyu: oyuncu.govde.boy,
    gunduzOrani: isik.gunduzOrani,
    akintiX: _akim.x,
    akintiY: _akim.y,
    akintiZ: _akim.z,
  };

  gidalariGuncelle(dunya.gidalar, oyuncu, isik, _akim.x, _akim.y, _akim.z, dt);
  npcleriGuncelle(dunya.npcler, ortam, dunya.gidalar, dt);
  dunya.parcaciklar.guncelle(oyuncu, _akim.x, _akim.y, _akim.z, dt);

  // Ağız yarıçapı gövde yarıçapının bir kısmı — balık her şeyi "emmiyor".
  const agiz = agizNoktasi(oyuncu);
  const agizYaricapi = Math.max(3, oyuncuYaricapi(oyuncu) * 0.34);
  const oncekiEvre = oyuncu.evre;

  for (const yenen of yemeKontrol(dunya.gidalar, agiz, agizYaricapi, oyuncu.evre)) {
    ilerleme.besin += yenen.tur.besin;
    ilerleme.toplamYenen += 1;
    ilerleme.yenen[yenen.tur.ad as GidaAdi] += 1;
    ilerleme.aclik = Math.min(1, ilerleme.aclik + aclikKatkisi(yenen.tur.besin));
    dunya.parcaciklar.yemeEfekti(yenen.x, yenen.y, yenen.z, yenen.tur.renk);
    // Yeme geri bildirimi tek kanaldan gelince fark edilmiyordu: gövde ısırır,
    // kamera kısa bir darbe alır, HUD parlar. Üçü birlikte "yedim" diyor.
    isirmaBaslat(oyuncu.govde);
    dunya.sahne.darbe(0.5 + Math.min(1, yenen.tur.besin / 6) * 0.5);
    yemeVurgusuGoster(dunya.hud);
  }

  // Kendinden yeterince küçük balıkları avlar. Tersi yok: oyuncu hiçbir zaman
  // yenmiyor, sakin ton bozulmuyor.
  const av = yenebilirBalikBul(dunya.npcler, agiz, agizYaricapi, oyuncu.govde.boy);
  if (av) {
    const besin = balikBesini(av);
    const renk = av.tur.gorunum.yan;
    const ax = av.x;
    const ay = av.y;
    const az = av.z;
    if (balikYe(dunya.npcler, dunya.sahne.scene, av)) {
      ilerleme.besin += besin;
      ilerleme.toplamYenen += 1;
      ilerleme.yenenBalik += 1;
      ilerleme.aclik = Math.min(1, ilerleme.aclik + aclikKatkisi(besin));
      dunya.parcaciklar.yemeEfekti(ax, ay, az, renk);
      // Balık yutmak yem yemekten daha büyük bir olay: darbe de daha güçlü.
      isirmaBaslat(oyuncu.govde);
      dunya.sahne.darbe(1.6);
      yemeVurgusuGoster(dunya.hud);
    }
  }
  // Yenebilirlik vurgusu: ağza yaklaşan balıklardan yenebilenler parlıyor, çok
  // büyük olanlar soluyor. Aynı eşik (yenebilirMi) yakalamada da kullanılıyor, yani
  // "parlıyor ama yenmiyor" durumu oluşamaz.
  const vurguMenzili = oyuncu.govde.boy * 2.5;
  for (const b of dunya.npcler) {
    const bdx = b.x - agiz.x;
    const bdy = b.y - agiz.y;
    const bdz = b.z - agiz.z;
    const uzaklik = Math.sqrt(bdx * bdx + bdy * bdy + bdz * bdz);
    const yakinlik = Math.max(0, 1 - uzaklik / vurguMenzili) ** 2;
    const isaret = yenebilirMi(b.boy, oyuncu.govde.boy) ? 1 : -1;
    govdeVurgusuAyarla(b.govde, yakinlik * isaret);
  }

  populasyonuTazele(dunya.npcler, dunya.sahne.scene, dt);

  const aclikSonucu = aclikGuncelle(ilerleme.aclik, ilerleme.besin, dt);
  ilerleme.aclik = aclikSonucu.aclik;
  ilerleme.besin = aclikSonucu.besin;

  const yeniEvre = evreIndeksi(ilerleme.besin);
  if (yeniEvre > oncekiEvre) {
    oyuncuEvresiniAyarla(oyuncu, yeniEvre);
    dunya.parcaciklar.evreEfekti(oyuncu.x, oyuncu.y, oyuncu.z);
    npcSuruEkle(dunya.npcler, dunya.sahne.scene);
    duyuruGoster(dunya.hud, `${EVRELER[yeniEvre]!.ad} oldun`);
    ilerlemeKaydet(ilerleme);
    dunya.kayitSayaci = 0;
  }

  hudGuncelle(dunya.hud, dt);

  dunya.kayitSayaci += dt;
  if (dunya.kayitSayaci >= KAYIT_ARALIGI) {
    dunya.kayitSayaci = 0;
    ilerlemeKaydet(ilerleme);
  }
}

export function dunyaCiz(dunya: Dunya, dt: number): void {
  const { oyuncu, isik, sahne } = dunya;

  sahne.isigiUygula(isik);
  dunya.dekor.guncelle(dunya.zaman, isik);
  const cizimAgzi = agizNoktasi(oyuncu);
  dunya.gidaCizici.guncelle(dunya.gidalar, oyuncu.evre, cizimAgzi, oyuncu.govde.boy);
  dunya.parcaciklar.isigiUygula(isik.ortamIsigi);

  sahne.kamerayiTakipEt(
    oyuncu.x,
    oyuncu.y,
    oyuncu.z,
    oyuncu.kameraIleri,
    oyuncu.govde.boy,
    dt,
  );
  sahne.ciz();

  hudCiz(dunya.hud, dunya.ilerleme, isik);
}
