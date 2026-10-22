import {
  ACESFilmicToneMapping,
  SRGBColorSpace,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { dunyaKonumu, kumYuksekligi, sinirla } from "../core/dunya";
import type { IsikDurumu } from "../game/daynight";

/**
 * Renderer, kamera, ışıklar ve sis.
 *
 * Kamera balığın **arkasına kilitli** (üçüncü şahıs takip). Fare balığı çevirdiği
 * için kamera da onunla çevriliyor; "ileri" her zaman ekranın içi oluyor.
 *
 * Önceden OrbitControls ile serbest bir kamera vardı. Sorun şuydu: kamerayı yana
 * çevirince balığın kendi eksenindeki dönüşü ekranda başka bir yöne karşılık geliyor,
 * hangi tuşun nereye çevireceğini kestirmek zorlaşıyordu. Takip kamerası bu ikiliği
 * ortadan kaldırıyor — bedeli, sahneyi dışarıdan seyretme imkânını kaybetmek.
 *
 * Su altı hissinin çoğu `FogExp2`'den geliyor: uzaktaki her şey su rengine karışıyor.
 * 2B sürümdeki "derinlik sisi" elle karıştırılıyordu, burada bedavaya geliyor.
 */

/** Retina ekranlarda dolgu maliyeti dört katına çıkıyor; 2 üstü fark edilmiyor. */
const MAKS_PIKSEL_YOGUNLUGU = 2;

/** Kamera balığın kaç boy gerisinde durur (sabit pay + boya orantılı kısım). */
const KAMERA_MESAFESI = 14;
const KAMERA_MESAFE_CARPANI = 1.7;

/** Omuz hizası: kamera balığın biraz üstünden bakar, burun ufku kapatmasın. */
const KAMERA_YUKSEKLIGI = 4;

/** Bakış noktası balığın biraz önü — kadrajın ağırlığı gidilen yöne kayar. */
const BAKIS_ONU = 2.4;

/** Kameranın dinlenme görüş açısı. */
const TEMEL_FOV = 58;

/**
 * Yeme anındaki görüş açısı darbesi: FOV bir anlık genişleyip geri oturuyor.
 * Kamerayı sarsmak yerine bunu seçtim — sarsıntı bu oyunun sakin tonuna ters
 * düşüyor, FOV zıplaması ise çarpma hissini veriyor ama sahneyi bozmuyor.
 */
const DARBE_FOV = 5.5;
const DARBE_SURESI = 0.26;

export interface Sahne {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** Gece-gündüz döngüsünü sis ve ışıklara sürer. */
  isigiUygula(isik: IsikDurumu): void;
  /**
   * Kamerayı balığın arkasına yerleştirir (simülasyon koordinatı + bakış vektörü).
   *
   * `kameraIleri` **kameranın** baktığı yön, balığınki değil: serbest bakışta (sağ
   * tuş) ikisi ayrışıyor ve kamera balığın etrafında dönüyor. Simülasyon ekseninde
   * verilir: y aşağı doğru pozitiftir.
   */
  kamerayiTakipEt(
    x: number,
    y: number,
    z: number,
    kameraIleri: Vector3,
    boy: number,
    dt: number,
  ): void;
  /** Yeme anında kısa bir görüş açısı darbesi verir. */
  darbe(guc?: number): void;
  ciz(): void;
  boyutDinle(geriCagri: () => void): void;
}

export function sahneKur(canvas: HTMLCanvasElement): Sahne {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAKS_PIKSEL_YOGUNLUGU));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  const scene = new Scene();
  scene.fog = new FogExp2(0x0d4f75, 0.0038);
  scene.background = new Color(0x0d4f75);

  // Uzak kırpma düzlemi zemin düzlemini kapsamalı: zemin resiften 1,9 kat geniş
  // (2242 × 1558) ve bir köşeden öteki kenara bakış ~2800 birim. 2200'de uzak kum
  // kesiliyor ve sisin içinde siyah bir kenar beliriyordu.
  const camera = new PerspectiveCamera(
    TEMEL_FOV,
    window.innerWidth / window.innerHeight,
    0.5,
    3400,
  );

  // Yarımküre ışığı suyun genel aydınlığını, yönlü ışık yüzeyden gelen güneşi verir.
  const ortamIsigi = new HemisphereLight(0x9fe4ff, 0x1d3320, 1.15);
  scene.add(ortamIsigi);

  const gunes = new DirectionalLight(0xffffff, 1.5);
  gunes.position.set(60, 240, 90);
  scene.add(gunes);

  const dinleyiciler: Array<() => void> = [];

  function yenidenBoyutlandir(): void {
    const g = window.innerWidth;
    const y = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAKS_PIKSEL_YOGUNLUGU));
    renderer.setSize(g, y, false);
    camera.aspect = g / y;
    camera.updateProjectionMatrix();
    for (const geriCagri of dinleyiciler) geriCagri();
  }

  yenidenBoyutlandir();

  // Pencere sürüklenirken resize saniyede onlarca kez tetikleniyor; bir sonraki
  // karede topluyoruz.
  let bekleyen = 0;
  window.addEventListener("resize", () => {
    if (bekleyen) return;
    bekleyen = requestAnimationFrame(() => {
      bekleyen = 0;
      yenidenBoyutlandir();
    });
  });

  const sisRengi = new Color();
  const gokRengi = new Color();
  const dipRengi = new Color();

  const _hedefKonum = new Vector3();
  const _bakisNoktasi = new Vector3();
  // İlk karede kamera yumuşatma yapmadan yerine oturur; yoksa oyun açılırken
  // sahnenin ortasından balığa doğru bir kayma izleniyor.
  let ilkKare = true;

  // Darbe: kalan süre ve o darbenin gücü.
  let darbeKalan = 0;
  let darbeGucu = 1;

  return {
    renderer,
    scene,
    camera,

    isigiUygula(isik) {
      // Derinlikle koyulaşan su: sis rengi yüzey ile dip arasında bir yerde.
      // setRGB varsayılan olarak lineer uzay bekler; değerlerimiz sRGB.
      sisRengi.setRGB(
        isik.dipRengi[0] / 255,
        isik.dipRengi[1] / 255,
        isik.dipRengi[2] / 255,
        SRGBColorSpace,
      );
      gokRengi.setRGB(
        isik.yuzeyRengi[0] / 255,
        isik.yuzeyRengi[1] / 255,
        isik.yuzeyRengi[2] / 255,
        SRGBColorSpace,
      );
      dipRengi.copy(sisRengi).multiplyScalar(0.45);

      // Sis rengi saf dip rengi olursa su bulanık/çamurlu görünüyor. Ege suyu
      // berrak: uzak mesafe yüzey renginin bir kısmını taşıyor.
      sisRengi.lerp(gokRengi, 0.45);
      (scene.fog as FogExp2).color.copy(sisRengi);
      (scene.background as Color).copy(sisRengi);
      // Gece sis yoğunlaşıyor: görüş mesafesi kısalıyor, sahne kapanıyor.
      //
      // Gündüz yoğunluğu resif 4 kat büyüyünce 0,0034'ten 0,0029'a indirildi. Eski
      // değerde %50 solma 245 birimde oluyordu; 1180 birimlik resifte bu, nereye
      // gidersen git aynı büyüklükte bir kabarcığın içinde kalmak demekti. 0,0029 ile
      // %50 solma 287 birime çıkıyor, arazinin büyük ölçekli sırtları seçilebiliyor.
      (scene.fog as FogExp2).density = 0.0029 + (1 - isik.gunduzOrani) * 0.0028;

      ortamIsigi.color.copy(gokRengi);
      ortamIsigi.groundColor.copy(dipRengi);
      ortamIsigi.intensity = 0.7 + isik.gunduzOrani * 1.5;
      gunes.intensity = 0.15 + isik.gunduzOrani * 2.3;
      gunes.color.copy(gokRengi).lerp(new Color(0xffffff), 0.6);
    },

    kamerayiTakipEt(x, y, z, kameraIleri, boy, dt) {
      const ileri = kameraIleri;
      const mesafe = KAMERA_MESAFESI + boy * KAMERA_MESAFE_CARPANI;
      const yukseklikPayi = KAMERA_YUKSEKLIGI + boy * 0.35;

      // Hesap simülasyon koordinatında yapılıyor: kum yüksekliği ve yüzey sınırı
      // orada tanımlı. Çevrim en sonda, tek yerde.
      const kx = x - ileri.x * mesafe;
      const kz = z - ileri.z * mesafe;
      // y aşağı doğru arttığı için "yukarı kaydır" = çıkarmak.
      let ky = y - ileri.y * mesafe - yukseklikPayi;
      // Kamera kumun içine gömülmesin, suyun üstüne de çıkmasın.
      ky = sinirla(ky, 4, kumYuksekligi(kx, kz) - 4);

      dunyaKonumu(kx, ky, kz, _hedefKonum);
      if (ilkKare) {
        camera.position.copy(_hedefKonum);
        ilkKare = false;
      } else {
        // Gecikmeli takip: dönüşlerde kamera hafifçe geride kalıyor, hız hissi veriyor.
        // Pointer lock'ta çok yavaş takip bulantı yaptığı için katsayı yüksek tutuldu.
        camera.position.lerp(_hedefKonum, 1 - Math.exp(-9 * dt));
      }

      // FOV darbesi: sin eğrisiyle çıkıp iniyor, ani kesme olmuyor.
      if (darbeKalan > 0) {
        darbeKalan = Math.max(0, darbeKalan - dt);
        const t = darbeKalan / DARBE_SURESI;
        camera.fov = TEMEL_FOV + Math.sin(Math.PI * t) * DARBE_FOV * darbeGucu;
        camera.updateProjectionMatrix();
      } else if (camera.fov !== TEMEL_FOV) {
        camera.fov = TEMEL_FOV;
        camera.updateProjectionMatrix();
      }

      dunyaKonumu(
        x + ileri.x * boy * BAKIS_ONU,
        y + ileri.y * boy * BAKIS_ONU,
        z + ileri.z * boy * BAKIS_ONU,
        _bakisNoktasi,
      );
      camera.lookAt(_bakisNoktasi);
    },

    darbe(guc = 1) {
      // Üst üste gelen yemlerde darbe birikmesin; en güçlüsü kazansın.
      if (darbeKalan > 0 && guc <= darbeGucu) return;
      darbeKalan = DARBE_SURESI;
      darbeGucu = Math.min(1.6, guc);
    },

    ciz() {
      renderer.render(scene, camera);
    },

    boyutDinle(geriCagri) {
      dinleyiciler.push(geriCagri);
    },
  };
}
