/**
 * Uzamsal ızgara — "yakınımdaki komşular" sorgusu.
 *
 * Sürü kuvvetleri ve yem arama her birey için **bütün** listeyi tarıyordu. Bu makinede
 * ölçülen sonuç (kare başına, çizim hariç): 30 balıkta 0,32 ms · 60 balıkta 1,19 ms ·
 * 93 balıkta 2,16 ms — yani maliyet birey sayısının karesiyle büyüyor. Resif 4 kat
 * büyüyüp nüfus 215'e çıkınca aynı yaklaşım ~10 ms demekti; 60 fps bütçesinin (16,7 ms)
 * yarısından fazlası, üstelik bu çizimden önce.
 *
 * Izgara yalnızca **x-z düzleminde** bölüyor. Balıklar dikeyde zaten dar bir banda
 * sıkışmış durumda; üçüncü ekseni bölmek hücre sayısını katlayıp kazanç getirmiyor.
 *
 * Sorgu yarıçapı nesneden nesneye değişiyor (orkinos 1050 birim, hamsi 75 birim).
 * Bu bir sorun değil: büyük yarıçaplı birey tüm ızgarayı tarar ama onlardan sadece
 * birkaç tane var, toplam maliyet küçük yarıçaplı kalabalığın belirlediği yerde kalıyor.
 */

export interface IzgaraNesnesi {
  readonly x: number;
  readonly z: number;
}

export interface Izgara<T extends IzgaraNesnesi> {
  /** Listeyi hücrelere dağıtır. Her karede bir kez çağrılır. */
  yenile(liste: readonly T[]): void;
  /**
   * Yarıçapı kapsayan hücrelerdeki **adayları** `hedef`e yazar ve onu döndürür.
   * Aday demek: kaba eleme yapılmış, kesin mesafe kontrolü çağırana ait.
   * `hedef` yeniden kullanılıyor — her karede yeni dizi ayırmamak için.
   */
  sorgula(x: number, z: number, yaricap: number, hedef: T[]): T[];
}

export function izgaraOlustur<T extends IzgaraNesnesi>(
  genislik: number,
  zGenislik: number,
  hucreBoyu: number,
): Izgara<T> {
  const sutun = Math.max(1, Math.ceil(genislik / hucreBoyu));
  const satir = Math.max(1, Math.ceil(zGenislik / hucreBoyu));
  const hucreler: T[][] = [];
  for (let i = 0; i < sutun * satir; i++) hucreler.push([]);

  function sutunIndeksi(x: number): number {
    const i = Math.floor(x / hucreBoyu);
    return i < 0 ? 0 : i >= sutun ? sutun - 1 : i;
  }

  function satirIndeksi(z: number): number {
    const j = Math.floor(z / hucreBoyu);
    return j < 0 ? 0 : j >= satir ? satir - 1 : j;
  }

  return {
    yenile(liste) {
      for (const hucre of hucreler) hucre.length = 0;
      for (const nesne of liste) {
        hucreler[satirIndeksi(nesne.z) * sutun + sutunIndeksi(nesne.x)]!.push(nesne);
      }
    },

    sorgula(x, z, yaricap, hedef) {
      hedef.length = 0;
      const i0 = sutunIndeksi(x - yaricap);
      const i1 = sutunIndeksi(x + yaricap);
      const j0 = satirIndeksi(z - yaricap);
      const j1 = satirIndeksi(z + yaricap);
      for (let j = j0; j <= j1; j++) {
        const taban = j * sutun;
        for (let i = i0; i <= i1; i++) {
          const hucre = hucreler[taban + i]!;
          for (let k = 0; k < hucre.length; k++) hedef.push(hucre[k]!);
        }
      }
      return hedef;
    },
  };
}
