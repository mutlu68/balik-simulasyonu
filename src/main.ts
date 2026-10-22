import "./style.css";
import { donguBaslat } from "./core/loop";
import { girdiKur } from "./core/input";
import { sahneKur } from "./render/sahne";
import { dunyaCiz, dunyaGuncelle, dunyaOlustur, dunyayiSifirla } from "./game/world";
import { ilerlemeKaydet, ilerlemeSil, ilerlemeYukle } from "./game/save";
import * as dunyaSabitleri from "./core/dunya";

const canvas = document.querySelector<HTMLCanvasElement>("#oyun");
if (!canvas) throw new Error("#oyun canvas'ı bulunamadı.");

const sahne = sahneKur(canvas);
const girdi = girdiKur(canvas);
const dunya = dunyaOlustur(ilerlemeYukle(), sahne);

/** Yalnızca geliştirmede kullanılıyor; sahneyi dondurup inceleyebilmek için. */
let duraklatildi = false;

donguBaslat(
  (dt) => {
    if (!duraklatildi) dunyaGuncelle(dunya, girdi, dt);
  },
  (dt) => dunyaCiz(dunya, dt),
);

// Sekme kapanırken son durumu kaydet — 3 saniyelik otomatik kayıt aralığını kaçırmamak için.
window.addEventListener("pagehide", () => ilerlemeKaydet(dunya.ilerleme));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") ilerlemeKaydet(dunya.ilerleme);
});

// Fare kilidi açıkken oyun sürülüyor; kapalıyken "tıkla ve yüz" uyarısı görünür.
// Uyarı katmanı tıklamayı yutmuyor (pointer-events: none), yoksa Sıfırla düğmesi
// erişilemez hale geliyordu.
const kilitUyarisi = document.querySelector<HTMLElement>("#hud-fare-kilidi");
girdi.kilitDinle((kilitli) => {
  document.body.classList.toggle("fare-kilitli", kilitli);
  if (kilitUyarisi) kilitUyarisi.hidden = kilitli;
});

const sifirlaDugmesi = document.querySelector<HTMLButtonElement>("#sifirla");
sifirlaDugmesi?.addEventListener("click", () => {
  ilerlemeSil();
  dunyayiSifirla(dunya);
  sifirlaDugmesi.blur();
});

// Geliştirme kancaları. Vite bu bloğu üretim derlemesinde tamamen atar.
if (import.meta.env.DEV) {
  const kanca = window as unknown as Record<string, unknown>;
  kanca["dunya"] = dunya;
  kanca["girdi"] = girdi;
  kanca["sahne"] = sahne;
  // Konsoldan dinamik import modülün ayrı bir kopyasını veriyor (Vite her modülü
  // kendi URL soruguyla servis ediyor); canlı değerler için modüllerin kendisi de
  // burada yayınlanıyor.
  kanca["sabitler"] = dunyaSabitleri;
  kanca["duraklat"] = (deger = true) => {
    duraklatildi = Boolean(deger);
    return duraklatildi;
  };
  // Ölçüm için hızlı ilerletme: çizim yapmadan yalnızca simülasyonu koşturur.
  kanca["ilerlet"] = (adim = 600) => {
    for (let i = 0; i < adim; i++) dunyaGuncelle(dunya, girdi, 1 / 60);
    return { adim, zaman: +dunya.zaman.toFixed(1) };
  };
  // Kare maliyeti ölçümü. requestAnimationFrame arka plandaki sekmede hiç
  // çalışmadığı için güncelleme+çizimi doğrudan çağırıp süreyi ölçüyoruz.
  kanca["olc"] = (kare = 120) => {
    const sureler: number[] = [];
    for (let i = 0; i < kare; i++) {
      const t0 = performance.now();
      dunyaGuncelle(dunya, girdi, 1 / 60);
      dunyaCiz(dunya, 1 / 60);
      sureler.push(performance.now() - t0);
    }
    sureler.sort((a, b) => a - b);
    const ortalama = sureler.reduce((a, b) => a + b, 0) / sureler.length;
    const bilgi = sahne.renderer.info.render;
    return {
      kare,
      ortalamaMs: +ortalama.toFixed(2),
      medyanMs: +sureler[Math.floor(kare / 2)]!.toFixed(2),
      p95ms: +sureler[Math.floor(kare * 0.95)]!.toFixed(2),
      cizimCagrisi: bilgi.calls,
      ucgen: bilgi.triangles,
    };
  };
}
