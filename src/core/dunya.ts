import { Vector3 } from "three";

/**
 * Dünya sabitleri ve koordinat dönüşümü.
 *
 * **Simülasyon kendi koordinat sisteminde kalıyor**: `y` yüzeyden aşağı doğru artan
 * derinlik (0 = su yüzeyi, YUKSEKLIK = en dip). Tüm ekosistem kodu (sürü davranışı,
 * gıda ekolojisi, derinlik tercihleri) bu düzene göre yazılmıştı ve 2B'den birebir
 * taşındı.
 *
 * Three.js ise Y-yukarı çalışır. İki sistemi her yerde karıştırmak yerine dönüşüm tek
 * bir fonksiyonda toplanıyor: `dunyaKonumu()`. Sadece çizim katmanı bunu kullanıyor.
 */

/** Resifin x ekseni genişliği. */
export const GENISLIK = 1180;
/** Su sütununun yüksekliği. */
export const YUKSEKLIK = 360;
/** Kameraya doğru olan derinlik ekseni. 3B'de kazanılan asıl hacim bu. */
export const Z_GENISLIK = 820;

/**
 * Resif tabanının alanı ve ilk 600 × 400'lük resife göre çarpanı (4,03).
 *
 * Nüfus, gıda ve dekor sayıları bu çarpana oranlı yazılıyor. Sabiti elle ölçeklemek
 * yerine çarpanla vermek, alan bir daha değişirse yoğunluğun kendiliğinden korunmasını
 * sağlıyor — ve hangi sayının neden o kadar olduğunu okunur tutuyor.
 */
export const TABAN_ALANI = GENISLIK * Z_GENISLIK;
export const ALAN_CARPANI = TABAN_ALANI / (600 * 400);

/**
 * Kumun **ortalama** seviyesi (simülasyon koordinatında).
 *
 * Gerçek zemin `kumYuksekligi()` ile bunun ±46 birim etrafında oynuyor. Derinlik
 * bantları (`tercihDerinlik * dipCizgisi()`) bu ortalamaya göre tanımlı; balıklar
 * gerçek zemine ayrıca sert sınırla tutuluyor.
 */
export function dipCizgisi(): number {
  return YUKSEKLIK - 55;
}

/**
 * Kum yüzeyinin (x, z) noktasındaki derinliği — simülasyon koordinatında, yani
 * büyük değer daha derin demek.
 *
 * Dipte duran her şey (denizyıldızı, kaya, bitki, dip balıkları) buna oturuyor;
 * düz bir taban varsayılırsa bir kısmı kumun içine gömülü kalıyor.
 *
 * Resif 600 × 400'den 1180 × 820'ye çıkınca tek ölçekli tepecikler yetmez oldu:
 * sis görüş mesafesi ~900 birim olduğu için 100 birimlik tümsekler her yerde aynı
 * görünüyor, "başka bir yere geldim" hissi oluşmuyordu. Şimdi üç ölçek var — 600-1200
 * birimlik sırtlar ve çanaklar, 150-400 birimlik tümsekler, 30 birimlik kum kırışıkları.
 */
export function kumYuksekligi(x: number, z: number): number {
  // Büyük ölçekli yer şekilleri yalnızca oyun alanı içinde değişsin. Zemin düzlemi
  // resiften ~2 kat geniş (kenarı sisin içinde kalsın diye) ve sınırlanmamış bir sırt
  // orada kumu suyun üstüne çıkarıyor.
  const ax = sinirla(x, 0, GENISLIK);
  const az = sinirla(z, 0, Z_GENISLIK);

  return (
    dipCizgisi() +
    // Büyük ölçek: sırtlar, çanaklar, açık kumluk düzlükleri.
    Math.cos(ax * 0.0049 - 1.1) * Math.sin(az * 0.0063 + 0.5) * 13 +
    Math.sin(ax * 0.0026 + 0.8) * 8 +
    Math.sin(az * 0.0034 - 0.5) * 6 +
    // Orta ölçek: tek tek görülebilen tümsek ve çukurlar.
    Math.sin(ax * 0.0075 + 2.2) * 7 +
    Math.sin(az * 0.0092 + 1.1) * 6 +
    Math.sin((ax + az) * 0.0131) * 4 +
    // Kum kırışıkları — yakından bakınca zemin düz görünmesin.
    Math.sin(ax * 0.031) * 1.4 +
    Math.sin(az * 0.026 + 0.9) * 1.1
  );
}

/**
 * Kum yüzeyinin (x, z) noktasındaki eğimi (yükseklik farkı / yatay mesafe).
 *
 * Bitki yerleşimi bunu kullanıyor: deniz çayırı düzlüğü, çalı yosunu yamacı seviyor.
 * Eğimi hesaba katmayan dağılımda çayır sırtların üstünde de bitiyor ve resif
 * "her yere aynı çim serilmiş" gibi görünüyor.
 */
export function kumEgimi(x: number, z: number): number {
  const adim = 8;
  const dx = kumYuksekligi(x + adim, z) - kumYuksekligi(x - adim, z);
  const dz = kumYuksekligi(x, z + adim) - kumYuksekligi(x, z - adim);
  return Math.sqrt(dx * dx + dz * dz) / (2 * adim);
}

/** Simülasyon koordinatını Three.js dünya koordinatına çevirir. */
export function dunyaKonumu(x: number, y: number, z: number, hedef: Vector3): Vector3 {
  return hedef.set(x - GENISLIK / 2, -y, z - Z_GENISLIK / 2);
}

/** Bir noktanın resif hacminin içinde kalmasını sağlar. */
export function sinirla(deger: number, min: number, maks: number): number {
  return deger < min ? min : deger > maks ? maks : deger;
}
