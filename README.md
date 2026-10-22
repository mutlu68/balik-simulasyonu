# Balık Simülasyonu (3B)

Tarayıcıda çalışan sakin bir Ege resifi. Bir çipura yavrusu olarak başlıyorsun, yiyerek
büyüyorsun, kamerayı istediğin açıya çeviriyorsun. Ölüm yok, kaybetme yok.

## Çalıştırma

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # tip kontrolü + dist/ üretimi
npm run preview  # dist/ çıktısını yerelde sunar
```

## Kontroller

Yüzmeye başlamak için ekrana tıkla — fare imleci oyuna kilitlenir. `Esc` ile bırakırsın.

| Tuş | İş |
|---|---|
| **fare** | balığın yönü (yatay = dönüş, dikey = eğim) |
| **sağ tuş basılı** | etrafına bak — balık dönmez, kamera onun etrafında döner |
| `W` / `S` | ileri – geri |
| `A` / `D` | sola – sağa kay |
| `Q` / `E` | yukarı – aşağı (`Space`/`Ctrl` ya da `↑`/`↓` de olur) |
| `←` / `→` | klavyeyle dön (fare kullanmak istemezsen) |
| `Shift` | hızlan |
| `Esc` | fareyi bırak |

Kamera balığın arkasına kilitli: baktığın yön her zaman gittiğin yön. Sağ tuşu basılı
tutarsan balık olduğu yönde kalır ve kamera etrafında döner; bıraktığında kamera
yumuşakça arkaya süzülür. `Q`/`E` burnu
çevirmeden dikine yükseltir — kayaların arasından çıkarken işe yarıyor.

## Balıklar

Resifte **20 tür** var, hamsiden orkinosa. Sahne tek: Karadeniz ve Akdeniz türleri
farklı derinlik bantlarını tutuyor.

| | Karadeniz | Akdeniz | Her ikisi |
|---|---|---|---|
| **yüzey** | kefal | zargana | — |
| **açık su** | istavrit, palamut, lüfer | orkinos, melanurya | hamsi |
| **orta** | — | izmarit, sarpa, çipura, karagöz, sinarit | levrek |
| **dip** | mezgit, kalkan | iskorpit, lahoz, orfoz | barbun |

En küçüğü hamsi (~10 birim), en büyüğü orkinos (~105-140). Oyuncu en büyük evresinde 48,
yani orkinos her zaman yenemeyeceğin kadar büyük — resifin üstünden geçen bir manzara.

## Neyi yiyebilirsin

Yaklaştığında **yenebilecek olan parlar**, yenemeyecek olan solar — ekranda başka bir
gösterge yok, hedefin kendisi söylüyor.

- **Balık**: kendi boyunun yarısından küçük olanları yiyebilirsin.
- **Yem**: her türün bir evre eşiği var — karides ve solucan **Parmak**, denizyıldızı
  **Genç**, denizanası **Erişkin** evresinde açılır. Eşiği geçmediğin yemler küçük ve
  sönük durur.

## Nasıl oynanır

- Yediğin her gıda **besin** puanı ekler. Beş evre: Yavru → Parmak → Genç → Erişkin → Koca.
- **Soluk/küçük görünen gıdalar** senin boyun için fazla büyük; yiyebilmek için büyümen
  gerekir.
- **Kendinden küçük balıkları avlayabilirsin** — boyunun yarısından küçük olanları.
  Yavruyken hiçbirini yakalayamazsın. Seni kimse yemez.
- **Tokluk** çubuğu yavaş azalır. Boşalırsa ölmezsin; büyüme durur ve besin puanın
  bulunduğun evrenin eşiğine kadar erir. Bir evre geriye düşmezsin.
- İlerleme tarayıcıya kaydedilir. Sağ alttaki **Sıfırla** baştan başlatır.

## Resifin dibi

Resif **1180 × 820 × 360 birim** (≈ 14 × 10 × 4,3 m). Tabanda sekiz bitki türü var ve
her biri nerede yetişeceğini biliyor — dibin bir yerden ötekine değişmesini sağlayan şey
tür sayısı değil, bu yerleşim:

| | Nerede | Ne |
|---|---|---|
| **Deniz çayırı** (posidonia) | düzlük kum, geniş çayırlıklar | boyu bir balık kadar, akıntıda bükülüyor |
| **Kum yosunu** | çayır aralarındaki açık kum | kısa, sık tutamlar |
| **Tüy yosunu** (caulerpa) | kum | sürünen sap, tüy filizler |
| **Çalı yosunu** (cystoseira) | yamaçlar | kahverengi alg çalısı |
| **Deniz marulu** (ulva) | yamaçlar | kırışık, parlak yeşil levhalar |
| **Deniz yelpazesi** (gorgon) | kayaların üstü | turuncu dallı yelpaze |
| **Turuncu sünger** | kayaların üstü | katı parmaklar, salınmaz |
| **Deniz şakayığı** | kayaların dibi | mor uçlu dokunaçlar, en esnek |

Son üçü aslında bitki değil, sabit yaşayan hayvan; Akdeniz kayalığında dibin görüntüsünü
onlar belirlediği için floranın parçası sayıldılar.

Ayrıca: kum üstünde **ışık ağı** (kaustik), yüzeyde **dalgalanan su**, yüzeyden inen
**ışık huzmeleri**, kaya çıkıntıları ve çakıl.

## Resif kendi başına yaşıyor

- **20 tür**, her biri kendi derinliğinde dolaşır ve kendi diyetini yer.
- **Sürüler** üç boyutta gerçek sürü kurallarıyla hareket eder ve yaklaşınca ürker —
  ürkeklik türden türe değişir. Lahoz seni umursamaz, hamsi uzaktan kaçar.
- **Gece ve gündüz** ~5 dakikada bir döner. Gece su lacivertleşir, sis yoğunlaşır,
  gündüz türleri dibe çekilir, **plankton yüzeye çıkar** (diel dikey göç).
- **NPC balıklar da yer.** Yem havuzu senin için beklemiyor.

## Yapı

```
src/
  core/      döngü, dünya koordinatı + arazi, uzamsal ızgara, klavye girdisi, rastgelelik
  render/    sahne (kamera/ışık/sis), omurga tabanlı 3B balık, ortam (zemin/kaya/yüzey/
             ışık huzmesi), bitkiler (8 tür flora), su shader'ı (salınım + kaustik)
  game/      oyuncu, türler, sürü davranışı, gıda ekolojisi, gece-gündüz,
             akıntı, parçacıklar
  ui/        HUD (DOM katmanı)
```

Mimari kararlar, ölçülen performans değerleri, renk uzayı tuzağı ve bilinen sorunlar:
[`proje-bilgi.md`](proje-bilgi.md).
