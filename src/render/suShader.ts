import { Vector2 } from "three";
import type { Material, WebGLProgramParametersWithUniforms } from "three";
import { dipCizgisi } from "../core/dunya";

/**
 * Sahnenin tamamının paylaştığı su etkileri: **bitki salınımı** (vertex) ve kum
 * üstündeki **ışık ağı / kaustik** (fragment).
 *
 * Neden shader? Çayır önceden her karede CPU'da güncelleniyordu: 2600 yaprağın matrisi
 * yeniden kuruluyor, `instanceMatrix` baştan yükleniyordu. Resif 4 kat büyüyünce yaprak
 * sayısı 11 bine çıkıyor ve aynı yaklaşım kare başına 11 bin matris demek. Salınımı
 * vertex shader'a taşıyınca CPU maliyeti **sıfıra** iniyor — matrisler bir kez yazılıyor,
 * her karede yalnızca iki uniform değişiyor.
 *
 * Yan kazanç görsel: matris döndürmesi yaprağı kökünden **düz** çeviriyordu, bu yüzden
 * yaprak bir çubuk gibi yatıyordu. Vertex kaydırması yaprağı kökte sabit tutup ucunu
 * kaydırıyor, yani yaprak gerçekten **bükülüyor**.
 *
 * ### Esneklik neden köşe verisi, uniform değil
 *
 * Her bitki türü için ayrı bir esneklik uniform'u kullanmak, tür başına ayrı bir
 * malzeme ve ayrı bir shader programı demekti. Onun yerine büküm miktarı `aEgilme`
 * köşe verisinde taşınıyor: bütün bitkiler **tek malzeme, tek program** paylaşıyor ve
 * bir bitkinin içinde bükülme değişebiliyor (şakayığın gövdesi katı, dokunaçları esnek).
 *
 * ### Program önbelleği tuzağı
 *
 * Three.js derlenmiş programları malzeme parametrelerinden üretilen bir anahtarla
 * paylaştırıyor. İki malzemenin anahtarı aynı çıkarsa ikincisi için `onBeforeCompile`
 * **hiç çağrılmıyor** ve buradaki uniform'lar o malzemeye hiç bağlanmıyor — shader
 * sessizce sıfır okuyor. Her malzemeye benzersiz `customProgramCacheKey` veriliyor;
 * bedeli birkaç fazladan program derlemesi.
 */

/** Kaustiğin belirgin olduğu dünya-y bandı: derin çanak → sığ sırt. */
const KAUSTIK_BANT = new Vector2(-(dipCizgisi() + 45), -(dipCizgisi() - 45));

/**
 * Bütün su malzemelerinin paylaştığı uniform'lar. Nesneler paylaşıldığı için
 * `.value` değiştirmek her malzemeyi aynı anda günceller.
 */
export const suUniformlari = {
  uZaman: { value: 0 },
  /** Genel akıntının yatay bileşeni — bitkiler hep aynı yöne yatsın diye. */
  uAkinti: { value: new Vector2(0.18, 0.06) },
  /** 0 = gece, 1 = tam gündüz. */
  uGunduz: { value: 1 },
  uKaustikBant: { value: KAUSTIK_BANT },
};

export function suZamaniGuncelle(zaman: number, gunduzOrani: number, akintiEgimi: number): void {
  suUniformlari.uZaman.value = zaman;
  suUniformlari.uGunduz.value = gunduzOrani;
  // Genel akıntı bitkileri ortak bir yöne yatırıyor; sabit bileşen "hiç durmayan
  // hafif akıntı", değişen bileşen yavaş salınım.
  suUniformlari.uAkinti.value.set(0.16 + akintiEgimi * 0.16, 0.05 + akintiEgimi * 0.1);
}

let _sayac = 0;

export interface SuGolgeAyari {
  /** Köşe verisindeki `aEgilme` ile bitkiyi büker. Geometride o veri olmalı. */
  readonly salinim?: boolean;
  /** Işık ağının şiddeti (0 = kapalı). Kum 2,4 · kaya 1,3 civarı. */
  readonly kaustik?: number;
}

/** Bir `MeshStandardMaterial`'e salınım ve/veya kaustik ekler. */
export function suGolgesiUygula(malzeme: Material, ayar: SuGolgeAyari): void {
  const salinim = ayar.salinim === true;
  const kaustik = ayar.kaustik ?? 0;
  if (!salinim && kaustik <= 0) return;

  const tanimlar: Record<string, unknown> = { ...(malzeme.defines ?? {}) };
  if (salinim) tanimlar["SU_SALINIM"] = "";
  if (kaustik > 0) tanimlar["SU_KAUSTIK"] = kaustik.toFixed(3);
  malzeme.defines = tanimlar;

  const anahtar = `su-${_sayac++}`;
  malzeme.customProgramCacheKey = () => anahtar;

  malzeme.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms["uZaman"] = suUniformlari.uZaman;
    shader.uniforms["uAkinti"] = suUniformlari.uAkinti;
    shader.uniforms["uGunduz"] = suUniformlari.uGunduz;
    shader.uniforms["uKaustikBant"] = suUniformlari.uKaustikBant;

    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        `
#ifdef SU_SALINIM
  attribute float aEgilme;
  uniform float uZaman;
  uniform vec2 uAkinti;
#endif
#ifdef SU_KAUSTIK
  varying vec3 vSuKonumu;
#endif

void main() {`,
      )
      // `project_vertex` yerine geçiyoruz çünkü büküm **instanceMatrix'ten sonra**,
      // yani dünya ölçeğinde uygulanmalı. Örnek matrisinden önce uygulansaydı
      // kaydırma yaprağın kendi ölçeğiyle (boy 16-42, en 1-2,4) çarpılır ve her
      // yaprak farklı miktarda bükülürdü.
      .replace(
        "#include <project_vertex>",
        `
vec4 mvPosition = vec4( transformed, 1.0 );

#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif

#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif

#ifdef SU_KAUSTIK
  vSuKonumu = ( modelMatrix * mvPosition ).xyz;
#endif

#ifdef SU_SALINIM
  float sBitkiBoyu = 1.0;
  #ifdef USE_INSTANCING
    sBitkiBoyu = length( instanceMatrix[ 1 ].xyz );
  #endif
  // Faz konuma bağlı: dalga çayırın içinden geçerek ilerliyor, bütün yapraklar
  // aynı anda yatmıyor. Katsayılar ~150 birimlik dalga boyuna denk geliyor.
  float sFaz = mvPosition.x * 0.042 + mvPosition.z * 0.031;
  vec2 sYon = uAkinti + vec2(
    sin( uZaman * 1.45 + sFaz ),
    sin( uZaman * 1.12 + sFaz * 1.7 + 1.9 )
  ) * 0.17;
  float sEgilme = aEgilme * sBitkiBoyu;
  mvPosition.xz += sYon * sEgilme;
  // Bükülen yaprak kısalır; yoksa yatarken kökünden uzuyormuş gibi görünüyor.
  mvPosition.y -= sEgilme * dot( sYon, sYon ) * 0.5;
#endif

mvPosition = modelViewMatrix * mvPosition;

gl_Position = projectionMatrix * mvPosition;
`,
      );

    if (kaustik > 0) {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "void main() {",
          `
uniform float uZaman;
uniform float uGunduz;
uniform vec2 uKaustikBant;
varying vec3 vSuKonumu;

void main() {`,
        )
        // Işık ağı: üç sinüs "duvar ailesi"nden **en yakınına** olan uzaklık. Sıfıra
        // yaklaşan yerler ağın parlak çizgileri.
        //
        // İlk denemede iki sinüsün çarpımı kullanılmıştı; ekranda ağ değil tek yöne
        // sıvanmış uzun lekeler çıktı, çünkü çarpımın tepe noktaları bir doğrultuda
        // diziliyor. Üç aile ve `min` ile çizgiler kesişip hücre oluşturuyor. Alan
        // büküm (`kNokta +=`) düzenli ızgara görüntüsünü kırıyor.
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
{
  float kZaman = uZaman * 0.33;

  vec2 kNokta = vSuKonumu.xz * 0.075;
  kNokta += vec2( sin( kNokta.y * 1.3 + kZaman ), cos( kNokta.x * 1.1 - kZaman * 0.8 ) ) * 0.6;
  float kUzaklik = min(
    abs( sin( kNokta.x + kZaman * 0.6 ) ),
    min(
      abs( sin( kNokta.y * 1.12 - kZaman * 0.45 ) ),
      abs( sin( ( kNokta.x + kNokta.y ) * 0.78 + kZaman * 0.8 ) )
    )
  );
  float kAg = pow( max( 0.0, 1.0 - kUzaklik * 3.0 ), 3.0 );

  // İkinci, daha ince ve hızlı katman: ağın içinde kıpırtı.
  vec2 kInce = vSuKonumu.xz * 0.16 + vec2( 3.1, -1.4 );
  kInce += vec2( sin( kInce.y + kZaman * 2.1 ), cos( kInce.x - kZaman * 1.7 ) ) * 0.45;
  float kInceUzaklik = min(
    abs( sin( kInce.x + kZaman * 1.4 ) ),
    abs( sin( kInce.y * 1.2 - kZaman * 1.1 ) )
  );
  kAg += pow( max( 0.0, 1.0 - kInceUzaklik * 3.4 ), 4.0 ) * 0.45;

  // Sığ sırtlarda belirgin, derin çanaklarda sönük — ışık yüzeyden geliyor.
  float kDerinlik = 0.5 + 0.5 * smoothstep( uKaustikBant.x, uKaustikBant.y, vSuKonumu.y );
  diffuseColor.rgb += diffuseColor.rgb * kAg * SU_KAUSTIK * uGunduz * kDerinlik;
}
`,
        );
    }
  };
}

/**
 * Su yüzeyi: köşeler dalgalanıyor, yüzeyde ışık pırıltısı geziyor.
 *
 * Yüzey alttan görülen bir tavan (`BackSide`). Düz bir levha olduğu sürece sahnenin en
 * yapay parçasıydı; dalga ve pırıltı onu "su" yapan asıl ayrıntı.
 */
export function yuzeyGolgesiUygula(malzeme: Material): void {
  const anahtar = `su-yuzey-${_sayac++}`;
  malzeme.customProgramCacheKey = () => anahtar;

  malzeme.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms["uZaman"] = suUniformlari.uZaman;
    shader.uniforms["uGunduz"] = suUniformlari.uGunduz;

    // Geometri `rotateX(π/2)` ile yatırıldığı için `position.xz` doğrudan düzlemin
    // kendi koordinatı; y sıfır ve dalgayı oraya yazıyoruz.
    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        `
uniform float uZaman;
varying vec2 vYuzeyKonumu;

void main() {`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vYuzeyKonumu = position.xz;
transformed.y += sin( position.x * 0.021 + uZaman * 0.85 ) * 2.4
               + sin( position.z * 0.0173 - uZaman * 0.67 ) * 1.9
               + sin( ( position.x + position.z ) * 0.041 + uZaman * 1.55 ) * 0.8;
`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `
uniform float uZaman;
uniform float uGunduz;
varying vec2 vYuzeyKonumu;

void main() {`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  float yZaman = uZaman * 0.6;
  // Dalga boyu ~45 birim (≈55 cm): 130 birimlik ilk denemede yüzey, kıpırdayan bir
  // su yüzeyi değil devasa lekeler gibi görünüyordu.
  float yA = sin( vYuzeyKonumu.x * 0.135 + sin( vYuzeyKonumu.y * 0.118 + yZaman * 1.3 ) * 2.0 + yZaman );
  float yB = sin( vYuzeyKonumu.y * 0.122 - sin( vYuzeyKonumu.x * 0.108 - yZaman * 1.1 ) * 1.7 - yZaman * 0.8 );
  diffuseColor.rgb += pow( max( 0.0, yA * yB ), 3.0 ) * uGunduz * 1.05;
}
`,
      );
  };
}
