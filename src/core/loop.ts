/**
 * Sabit adımlı oyun döngüsü.
 * Mantık her zaman 1/60 sn'lik adımlarla ilerler; ekran tazeleme hızı ne olursa olsun
 * fizik aynı hissettirir. Çizim her karede bir kez yapılır.
 */
const ADIM = 1 / 60;
/** Sekme arka plana alınıp geri dönünce birikmiş zamanı boşaltmamak için tavan. */
const MAKS_BIRIKIM = 0.25;

export interface Dongu {
  durdur(): void;
}

export function donguBaslat(
  guncelle: (dt: number) => void,
  ciz: (dt: number) => void,
): Dongu {
  let sonZaman = performance.now();
  let sonCizim = sonZaman;
  let birikim = 0;
  let calisiyor = true;
  let istek = 0;

  function kare(simdi: number): void {
    const kareBasi = sonCizim;
    sonCizim = simdi;
    if (!calisiyor) return;
    istek = requestAnimationFrame(kare);

    birikim += Math.min((simdi - sonZaman) / 1000, MAKS_BIRIKIM);
    sonZaman = simdi;

    while (birikim >= ADIM) {
      guncelle(ADIM);
      birikim -= ADIM;
    }

    ciz(Math.min(0.1, (simdi - kareBasi) / 1000));
  }

  istek = requestAnimationFrame(kare);

  return {
    durdur() {
      calisiyor = false;
      cancelAnimationFrame(istek);
    },
  };
}
