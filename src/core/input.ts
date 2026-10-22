/**
 * Klavye + fare girdisi (pointer lock).
 *
 * Balık **fareyle sürülüyor**: fare balığın burnunu çevirir (yatay = dönüş, dikey =
 * eğim), klavye onu o yönde hareket ettirir. Kamera balığın arkasına kilitli, yani
 * "ileri" her zaman ekranın içine doğru — kontrolün kameradan bağımsız olma derdi
 * ortadan kalkıyor.
 *
 * Öncesinde kamera OrbitControls ile serbestti ve balık A/D ile kendi ekseninde
 * dönüyordu; kamerayı yana çevirince hangi tuşun nereye çevireceğini kestirmek
 * zorlaşıyordu. Pointer lock bunu tek bir zihinsel modele indiriyor.
 *
 * Fare deltası kareler arasında **birikir** ve `bakisiTuket()` ile bir kez okunur;
 * aynı deltayı iki kez uygulamamak için okunduğunda sıfırlanır.
 *
 * **Sağ tuş basılıyken** delta balığa değil kameraya gider: balık olduğu yönde kalır,
 * kamera onun etrafında döner (serbest bakış). Tuş bırakılınca kamera arkaya süzülür.
 */

export interface Bakis {
  /** Yatay fare deltası (piksel, sağa pozitif). */
  x: number;
  /** Dikey fare deltası (piksel, aşağı pozitif). */
  y: number;
}

export interface Girdi {
  /** İleri (+1) / geri (-1) — bakılan yönde. */
  readonly ileri: number;
  /** Yana kayma: sola (-1) / sağa (+1). */
  readonly yana: number;
  /** Klavye yedeği: ok tuşlarıyla sola (-1) / sağa (+1) dönüş. */
  readonly donus: number;
  /** Dikey itki: yukarı (-1, yüzeye) / aşağı (+1, dibe). */
  readonly dikey: number;
  /** Hızlanma (Shift). */
  readonly hizli: boolean;
  /** Herhangi bir hareket tuşu basılı mı. */
  readonly aktif: boolean;
  /** Fare kilidi açık mı — kilitliyken fare balığı çevirir. */
  readonly kilitli: boolean;
  /** Sağ tuş basılı mı — basılıyken fare balığı değil kamerayı çevirir. */
  readonly serbestBakis: boolean;
  /** Biriken fare deltasını döndürür ve sıfırlar. */
  bakisiTuket(): Bakis;
  /** Kilit durumu değişince çağrılır (arayüz uyarısını göstermek için). */
  kilitDinle(geriCagri: (kilitli: boolean) => void): void;
}

const TUS_ILERI = new Set(["KeyW"]);
const TUS_GERI = new Set(["KeyS"]);
const TUS_SOL = new Set(["KeyA"]);
const TUS_SAG = new Set(["KeyD"]);
const TUS_DON_SOL = new Set(["ArrowLeft"]);
const TUS_DON_SAG = new Set(["ArrowRight"]);
const TUS_YUKARI = new Set(["KeyQ", "Space", "ArrowUp"]);
const TUS_ASAGI = new Set(["KeyE", "ControlLeft", "ControlRight", "ArrowDown"]);

export function girdiKur(canvas: HTMLCanvasElement): Girdi {
  const basili = new Set<string>();
  const dinleyiciler: Array<(kilitli: boolean) => void> = [];
  const bakis: Bakis = { x: 0, y: 0 };

  const durum = {
    ileri: 0,
    yana: 0,
    donus: 0,
    dikey: 0,
    hizli: false,
    aktif: false,
    kilitli: false,
    serbestBakis: false,

    bakisiTuket(): Bakis {
      _tuketilen.x = bakis.x;
      _tuketilen.y = bakis.y;
      bakis.x = 0;
      bakis.y = 0;
      return _tuketilen;
    },

    kilitDinle(geriCagri: (kilitli: boolean) => void): void {
      dinleyiciler.push(geriCagri);
      geriCagri(durum.kilitli);
    },
  };

  const _tuketilen: Bakis = { x: 0, y: 0 };

  function tazele(): void {
    let ileri = 0;
    let yana = 0;
    let donus = 0;
    let dikey = 0;
    for (const kod of basili) {
      if (TUS_ILERI.has(kod)) ileri += 1;
      else if (TUS_GERI.has(kod)) ileri -= 1;
      else if (TUS_SOL.has(kod)) yana -= 1;
      else if (TUS_SAG.has(kod)) yana += 1;
      else if (TUS_DON_SOL.has(kod)) donus -= 1;
      else if (TUS_DON_SAG.has(kod)) donus += 1;
      else if (TUS_YUKARI.has(kod)) dikey -= 1;
      else if (TUS_ASAGI.has(kod)) dikey += 1;
    }
    durum.ileri = Math.max(-1, Math.min(1, ileri));
    durum.yana = Math.max(-1, Math.min(1, yana));
    durum.donus = Math.max(-1, Math.min(1, donus));
    durum.dikey = Math.max(-1, Math.min(1, dikey));
    durum.hizli = basili.has("ShiftLeft") || basili.has("ShiftRight");
    durum.aktif =
      durum.ileri !== 0 || durum.yana !== 0 || durum.donus !== 0 || durum.dikey !== 0;
  }

  window.addEventListener("keydown", (e) => {
    // Boşluk sayfayı kaydırmasın, ok tuşları da öyle.
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    if (e.repeat) return;
    basili.add(e.code);
    tazele();
  });

  window.addEventListener("keyup", (e) => {
    basili.delete(e.code);
    tazele();
  });

  // Sekme değişince tuşlar basılı kalmasın.
  window.addEventListener("blur", () => {
    basili.clear();
    tazele();
  });

  // --- Fare kilidi -----------------------------------------------------------

  canvas.addEventListener("click", () => {
    if (durum.kilitli) return;
    // Esc'den hemen sonraki istek tarayıcı tarafından reddediliyor (kısa bir
    // bekleme dayatılıyor); kullanıcı tekrar tıklayacağı için sessizce geçiyoruz.
    const istek = canvas.requestPointerLock() as unknown;
    if (istek instanceof Promise) istek.catch(() => {});
  });

  document.addEventListener("pointerlockchange", () => {
    durum.kilitli = document.pointerLockElement === canvas;
    if (!durum.kilitli) {
      // Kilit çıkınca birikmiş delta uygulanmasın; yoksa Esc anında balık sıçrıyor.
      bakis.x = 0;
      bakis.y = 0;
      basili.clear();
      durum.serbestBakis = false;
      tazele();
    }
    for (const geriCagri of dinleyiciler) geriCagri(durum.kilitli);
  });

  // Sağ tuş: serbest bakış. Kilit dışında da izleniyor, zararsız ve durum tutarlı kalıyor.
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 2) durum.serbestBakis = true;
  });

  window.addEventListener("mouseup", (e) => {
    if (e.button === 2) durum.serbestBakis = false;
  });

  // Sağ tuş menüsü açılırsa fare kilidi düşüyor ve tuş "basılı kaldı" sanılıyor.
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("mousemove", (e) => {
    if (!durum.kilitli) return;
    // Bazı sürücüler tek karede çok büyük delta üretiyor (pencere geçişi, ivme);
    // sınırlamazsak balık bir anda ters yöne dönüyor.
    bakis.x += Math.max(-180, Math.min(180, e.movementX));
    bakis.y += Math.max(-180, Math.min(180, e.movementY));
  });

  return durum;
}
