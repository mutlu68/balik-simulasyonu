---
proje_adi: Balık Simülasyonu
tur: tarayıcı oyunu (3B)
durum: geliştirme
---

## Genel
- Amaç: Tarayıcıda çalışan sakin bir **3B Türkiye resifi** (Karadeniz + Akdeniz türleri
  tek sahnede). Oyuncu bir çipura yavrusu
  olarak başlar, yiyip büyür; kamera balığın arkasına kilitli. Ölüm, avlanma
  (oyuncuya karşı) veya kaybetme yok. Resif oyuncuyu beklemiyor: sürüler kendi
  derinliklerinde dolaşıyor, NPC balıklar besleniyor, gece-gündüz döngüsü işliyor.
- Müşteri/sahip: kişisel proje
- Repo: https://github.com/mutlu68/balik-simulasyonu (PUBLIC, dal `main`, 2026-10-22). Gerçek sırlar yalnızca `.gitignore`'daki env dosyalarında; push öncesi sır taraması temizdi.

## Stack
- Dil/çatı: TypeScript + Vite.
- 3B: **Three.js 0.186.0** (tek çalışma-zamanı bağımlılığı). Tipler `@types/three`.
- Veritabanı: yok — ilerleme `localStorage`'da (`balik-simulasyonu/ilerleme/v1`).

## Ortam ve Deploy
- Hosting/deploy hedefi: şimdilik yok, sadece yerel. `npm run build` → `dist/` statik.
- Ortamlar: yerel geliştirme (`npm run dev` → http://localhost:5173)
- CI/CD: yok · `.env` gerekli mi: hayır

## Kontroller

Canvas'a tıkla → **pointer lock**. `Esc` fareyi bırakır.

**fare** balığın yönünü verir (yatay = dönüş, dikey = eğim) · **sağ tuş basılı**
etrafına bak (balık dönmez, kamera döner) · `W/S` ileri-geri · `A/D` yana kay ·
`Q/E` (veya `Space`/`Ctrl`, `↑/↓`) dikey itki · `Shift` hızlan ·
`←/→` klavyeyle dönüş (fare yedeği).

Fare hassasiyeti `FARE_HASSASIYETI` (player.ts), şu an `0.0028` rad/piksel.

## Notlar

### Kontrol şeması: neden pointer lock (2026-09-18)

Önceki şema **serbest kamera (OrbitControls) + kendi ekseninde dönen balık**tı. Gerekçesi
şuydu: kontrol kameradan bağımsız olsun, kamerayı nereye çevirirsen çevir `A/D` aynı işi
yapsın. Pratikte tersi oldu — kamerayı yana çevirince balığın kendi eksenindeki dönüşü
ekranda başka bir yöne karşılık geliyor, hangi tuşun nereye çevireceğini kestirmek
zorlaşıyordu.

Şimdi: **fare yön verir, kamera balığın arkasına kilitli.** "İleri" her zaman ekranın içi.
Bedeli, sahneyi dışarıdan seyretme imkânının kaybı — resif kendi başına güzel olduğu için
bu gerçek bir kayıp, ama kontrol netliği ağır bastı.

İki tasarım kararı bilinçli:

- **Dikey itki (`Q/E`) bakış yönünden ayrı.** Burnu çevirmeden dikine yükselmek gerekiyor
  (kaya arasında, yüzeye çıkarken). Eğim ise yalnızca gövdenin duruşu + ileri hareketin
  yönü; dikey itkiyi ikinci kez etkilemiyor, yoksa `W+Q` fırlatma gibi hissettiriyor.
- **Fare hassasiyeti evreden bağımsız** (`FARE_HASSASIYETI`, player.ts). Klavye dönüşü ve
  hız evre büyüdükçe hantallaşıyor ama nişan alma hissinin evre değiştikçe kayması
  rahatsız edici.

Düzeltilen asıl hata: dikey hareket `o.hiz * ileri.y` üzerinden geliyordu ve `o.hiz`
yalnızca `W/S`'den besleniyordu — yani **`W`'ye basmadan `Q/E` balığı hiç yükseltmiyordu**,
sadece burnu kalkıyordu. Artık `dikeyHiz` ayrı bir alan.

### Tür tablosu: 8 → 20 tür, iki deniz (2026-09-18)

Hamsiden orkinosa uzanan bir boy merdiveni kuruldu. **Sahne bölünmedi**; Karadeniz ve
Akdeniz ayrımı `derinlik` bandından geliyor ve `deniz` alanı bu yerleşimin niyetini
kayda geçiriyor (kod akışında kullanılmıyor, tür eklerken hangi bandın dolu olduğu
görülsün diye duruyor).

Eklenenler — **Karadeniz**: istavrit, kefal, lüfer, palamut, mezgit, kalkan.
**Akdeniz**: melanurya, karagöz, zargana, sinarit, orfoz, orkinos.

Bunun için gövde sistemine tek bir alan eklendi: **`yanalBasiklik`** (`TurGorunumu`,
varsayılan 0.42 = yandan basık). Sabit olduğu sürece her balık aynı kesitteydi. Şimdi:

- **kalkan 2.7** — kumun üstünde yatan yassı balık, yatayda geniş (1'in üstü).
- **karagöz 0.32** — levha gövde, kayalık arasından yan dönerek süzülür.
- **zargana 0.78** — neredeyse yuvarlak kesitli kalem gövde.

**Uzun gövdeli türlerde `maksBukum` eklem sayısıyla ters orantılı seçilmeli.** Zarganayı
13 eklem + varsayılana yakın büküm (0.22) ile yazınca toplam büküm bütçesi 2.86 radyan
oldu ve balık kalem değil **yılan** gibi kıvrıldı; ekran görüntüsünde S şeklinde göründü.
0.075'e indirilince düz yüzerken baş-kuyruk sapması 45.8° → **8.8°** oldu (kalkan 1.5°,
karagöz 6.2° ile aynı aralık). Yeni uzun tür eklerken `maksBukum × eklemSayisi` çarpımına
bak: 1.0 civarı düz, 1.8+ belirgin kıvrımlı.

**Popülasyon garantisi değişti.** Önce yalnızca küçük gruplu türler (`grupBoyu[1] <= 4`)
garanti doğuyordu, gerisi ağırlıklı kuraya kalıyordu. 20 türde bu çöktü: hamsi ve izmarit
kotanın %59'unu yiyip **20 türün ancak 13'ü** sahneye çıkıyordu (orkinos, zargana, kefal,
palamut, mezgit, melanurya, sarpa hiç görünmedi). Artık **her türden en az bir grup**
doğuyor; karşılığında kalabalık sürülerin üst sınırı kısıldı (hamsi 24 → 18, izmarit 12 → 9)
ve `hedefSayi()` 58 → 88 çıktı. Sonuç: 95 birey, 20/20 tür.

**Ölçülen maliyet**: simülasyon 80 bireyde 3.39 ms/kare, 95 bireyde **4.31 ms/kare**
(`ilerlet(300)`, çizim hariç). 60 fps bütçesinin ~%26'sı. Sürü kuvvetleri O(n²) olduğu
için birey sayısını buradan çok artırmak pahalı — tür eklemek ucuz, birey eklemek değil.

### Yenebilirlik vurgusu (2026-09-18)

İki ayrı "yenemezsin" kuralı vardı ve **ikisi de görünmüyordu**:

- **Yem**: `evre < tur.minEvre` (denizanası evre 3, denizyıldızı 2, karides/solucan 1).
  Tek ipucu kilitli yemin %75 boyutta çizilmesiydi — yemler zaten farklı boyutta olduğu
  için hiç okunmuyordu.
- **Balık**: `boy <= oyuncuBoyu * 0.5` (`YENEBILIR_ORAN`). Hiçbir görsel ipucu yoktu.

Çözüm, HUD'a bir şey eklemeden **hedefin kendisini konuşturmak**. Yakınlık 0..1 hesaplanıp
karesi alınıyor (yalnızca gerçekten yaklaşınca belirginleşsin diye):

- Yenebilir + yaklaşıyor → parlar. Balıkta `material.emissive` (her balığın kendi
  `MeshStandardMaterial`'i var, paylaşım yok), yemde `setColorAt` ile instance rengi
  1 → 2.1 ve ölçek 1 → 1.4.
- Yenemez + yaklaşıyor → solar. Balıkta `material.color` 1 → 0.5, kilitli yemde sabit
  0.45 parlaklık ve 0.6 ölçek.

**Menzil balık boyuna oranlı**, ağız yarıçapına değil: ilk denemede `agizYaricapi * 6`
yazdım ama `agizYaricapi = boy * 0.17` olduğu için menzil bir balık boyundan kısa kaldı
ve vurgu ancak yem zaten yenirken görünüyordu. Şimdi balıkta `boy * 2.5`, yemde `boy * 1.6`.

Yakalama ve vurgu **aynı eşiği** kullanıyor (`yenebilirMi()`, npcFish.ts'den dışa açıldı) —
yoksa "parlıyor ama yenmiyor" durumu oluşur.

Ölçüm (oyuncu boyu 48, sınır 24, menzil 120): yenebilir balık 80 birimde vurgu 0.18,
50'de 0.40, 25'te 0.70; çok büyük balık 110'da −0.06, 80'de −0.19. Yem tarafında evre 0
ile çizdirince plankton/yosun 1.0, diğer dört tür 0.45 parlaklıkta.

### Serbest bakış: balık ile kamera yönünün ayrılması (2026-09-18)

Takip kamerası tek başına bir şeyi kaybettiriyordu: **etrafına bakmak**. Balığı çevirmeden
resife bakmak isteyince onu döndürmek zorunda kalıyordun.

Çözüm: `Oyuncu` artık **iki yön vektörü** taşıyor.

- `ileri` — balığın baktığı yön. Gövde çizimi, ağız noktası ve hareket bunu kullanıyor.
- `kameraIleri` — kameranın baktığı yön. Yalnızca `sahne.kamerayiTakipEt()` kullanıyor.

Normalde ikisi aynı. Sağ tuş basılıyken fare deltası balığın `yon/egim`'ine değil
`serbestYaw/serbestPitch`'e gidiyor; `kameraIleri` bu sapmayla hesaplanıyor, balık olduğu
yönde kalıyor. Tuş bırakılınca sapma `SERBEST_SONUM` (5/sn) ile sönüyor — ölçümde 1 saniyede
sıfırlanıyor. Ani geri dönüş baş döndürüyordu.

İki ayrıntı:

- `serbestYaw` her karede `[-π, π]` aralığına sarılıyor (`aciSar`). Sarmazsan kullanıcı
  iki tur döndükten sonra kamera arkaya dönerken uzun yolu alıyor.
- `mouseup` `window`'da dinleniyor, `canvas`'ta değil: fare canvas dışında bırakılınca
  tuş "basılı kaldı" sanılıyordu. Ayrıca `contextmenu` engelleniyor ve fare kilidi
  düşünce `serbestBakis` sıfırlanıyor.

### Yeme geri bildirimi: dört kanal birden (2026-09-18)

Yem yendiğinde tek olan şey 6-10 parçacıklı küçük bir saçılmaydı ve **yediğin
hissedilmiyordu** — balık hızlı yüzerken parçacıklar gövdenin arkasında kalıyor, tokluk
çubuğunun artışı küçük yemlerde bir iki piksel oluyor, göz de zaten balığa bakıyor.

Şimdi aynı anda dört şey oluyor (`world.ts` içinde tek yerde tetikleniyor):

1. **Isırma** (`fish3d.ts`, `isirmaBaslat`): baş halkası 0.22 sn'de açılıp kapanıyor,
   burun öne uzuyor. Alt ve üst çene ayrı katsayılarla açılıyor (`ISIRMA_ALT` 1.15,
   `ISIRMA_UST` 0.22) — simetrik açınca baş balon gibi şişiyordu.
2. **Kamera darbesi** (`sahne.ts`, `darbe(guc)`): FOV 58°'den ~63°'ye çıkıp geri
   oturuyor. Kamerayı **sarsmak yerine** bu seçildi; sarsıntı bu oyunun sakin tonuna ters.
   Balık yutmada güç 1.6 (FOV ~65°), yemde besine göre 0.5–1.0.
3. **Parçacık**: 6-10 → 16-22 adet, hız 14-46 → 26-78, ömür 0.3-0.7 → 0.45-0.95.
4. **HUD vurgusu** (`hud.ts`, `yemeVurgusuGoster`): tokluk çubuğu 0.45 sn parlayıp
   sönüyor, besin sayacı onunla birlikte.

Ses **yok** — proje tamamen sessiz, eklemek ayrı bir karar (yol haritasında duruyor).

### Resif 4 kat büyüdü, dip bitki örtüsü sekiz türe çıktı (2026-09-22)

İstek üçlüydü: yerdeki bitki çeşitliliğini artır, oyun alanını genişlet, görüntü
detayını artır. Üçü birbirine bağlı çıktı — alanı büyütmek nüfusu, nüfus performansı,
performans da çayırın nasıl canlandırıldığını zorladı.

**Yeni ölçüler**: 600 × 300 × 400 → **1180 × 360 × 820**. Taban alanı 4,03 kat
(`ALAN_CARPANI`, `core/dunya.ts`). Nüfus, gıda ve dekor sayıları bu çarpanla yazılıyor;
elle ölçeklenmiş sabitler yerine çarpan kullanmak, alan bir daha değişirse yoğunluğun
kendiliğinden korunmasını sağlıyor.

Ölçeklenenler: balık 88 → **215** (2,4 kat, birebir değil — sürüler kümelendiği için
açık kumun boş olması doğru), gıda 60 → **202**, kaya 90 → **333**, çakıl → **1290**,
bitki 2600 → **13 822**.

**Arazi üç ölçekli oldu.** Eski `kumYuksekligi()` tek ölçekte tümsek üretiyordu; 1180
birimlik resifte bu, nereye gidersen git aynı manzara demekti. Şimdi 600-1200 birimlik
sırtlar/çanaklar, 150-400 birimlik tümsekler ve 30 birimlik kum kırışıkları üst üste
biniyor. Büyük ölçekli terimler `sinirla()` ile oyun alanına hapsediliyor: zemin düzlemi
resiften 1,9 kat geniş ve sınırlanmamış bir sırt kumu orada suyun üstüne çıkarıyordu.

Yanına `kumEgimi()` eklendi (sonlu fark). Hem bitki yerleşimi hem zemin rengi bunu
kullanıyor: dik yamaç yeşile kayıyor **ve** çalı yosunu tutuyor, iki ipucu üst üste
düştüğü için yamaç okunur oluyor.

**Sis gündüz 0,0034 → 0,0029.** Eski değerde %50 solma 245 birimde oluyordu; 1180
birimlik resifte nereye gidersen git aynı büyüklükte bir kabarcığın içindeydin. 0,0029
ile 287 birim. Kamera uzak düzlemi de 2200 → 3400 (zemin düzleminin köşesi 2800 birim
uzakta, eskisinde kesiliyordu).

### Uzamsal ızgara: kare maliyeti O(n²)'den doğrusala (2026-09-22)

Sürü kuvvetleri ve yem araması her birey için bütün listeyi tarıyordu. **Bu makinede
ölçülen** (kare başına, çizim hariç, `ilerlet(200)`):

| balık | eski (tam tarama) |
|---|---|
| 30 | 0,32 ms |
| 60 | 1,19 ms |
| 93 | 2,16 ms |

Uyan eğri `0,0045·n + 2,0e-4·n²`; 215 birey için **~10,5 ms** demek, yani 60 fps
bütçesinin (16,7 ms) yarısından fazlası ve bu çizimden önce. `core/izgara.ts` eklendi:
x-z düzleminde hücrelere bölen, her karede yenilenen bir aday listesi. Dikey eksen
bölünmüyor — balıklar zaten dar bir banda sıkışmış, hücre sayısını katlamak kazanç
getirmiyor.

Aynı ölçüm ızgaradan **sonra**: 54 balık 1,55 ms · 108 balık 3,07 ms · 216 balık
6,04 ms. Birey başına 28,6 / 28,4 / 28,0 µs — **kare terimi kayboldu**, maliyet düz
doğrusal. 216 bireyde tam tarama ~10,5 ms olurken ızgarayla 6,0 ms.

Kalan 28 µs/balık'ın çoğu ızgara değil `govdeGuncelle()`: her balığın omurga mesh'i
her karede yeniden yazılıyor. Bir sonraki kaldıraç bu — uzaktaki balıkların gövdesini
her karede değil üç karede bir güncellemek. Şu an gerek yok, bütçede 2,3 kat pay var.

İki ayrıntı ızgarayı doğru kullanmak için önemli:

- **Sorgu yarıçapı bireyden bireye değişiyor** (hamsi 75, orkinos 1050 birim). Bu sorun
  değil: geniş yarıçaplı birey neredeyse tüm ızgarayı tarar ama onlardan birkaç tane var.
- **Yarıçap yalnızca toplanma menzili olamaz.** Ayrışma her türle işlediği için küçük
  balığın kendinden çok büyük komşuyu da görmesi gerekiyor:
  `max(boy · 7,5, (boy + en büyük boy) / 2)`. İlk yazımda bu ikinci terim yoktu ve
  hamsi orkinosun içinden geçiyordu.

### Dipte sekiz tür: `render/bitkiler.ts` (2026-09-22)

Tek tür (posidonia yaprağı, 2600 kutu) yerine sekiz tür, 13 822 birey. Türler:
deniz çayırı, kum yosunu, tüy yosunu (caulerpa), çalı yosunu (cystoseira), deniz marulu
(ulva), deniz yelpazesi (gorgon), turuncu sünger, deniz şakayığı. Son üçü bitki değil,
sabit yaşayan hayvan — Akdeniz kayalığında dibin görüntüsünü onlar belirlediği için
dahil edildiler.

**Asıl mesele tür sayısı değil yerleşim.** Her türün bir habitatı var: `duzluk`
(eğim < 0,13), `yamac`, `kayaUstu`, `kayaDibi`. Kaya listesi `environment.ts`'ten
`bitkileriKur()`'a geçiyor; kaya üstü yerleşimde elipsoit yüzey yüksekliği hesaplanıp
bitki dışa yatırılıyor. Sekiz türü de her yere eşit dağıtsaydık sonuç "her yere aynı
karışık çim serilmiş" olurdu.

**Ortak kurallar** (yeni bir tür eklerken uyulması gerekenler):

- Geometri **birim kutuda** üretilir: y 0..1 (kök → uç), x/z ±0,5. Örnek matrisi
  (en, boy, en) ile ölçekler. Salınım shader'ı `position.y`'yi büküm ağırlığı olarak
  okuduğu için bu zorunlu.
- Renk köşede taşınır (kökte koyu, uçta açık), örnek başına `setColorAt` ile
  dalgalandırılır. `instanceColor`ın uygulanabilmesi için malzemede `vertexColors: true`
  **ve** geometride bir `color` verisi bulunmalı — three.js'in `color_fragment` parçası
  yalnızca `USE_COLOR` tanımlıyken `vColor`u uyguluyor, tek başına `USE_INSTANCING_COLOR`
  yetmiyor. (Kaya ve çakıla bu yüzden beyaz renk verisi ekleniyor.)
- Şerit (`serit`) ve boru (`boru`) yardımcıları her şeyi kuruyor: yaprak, dal, dokunaç,
  sünger parmağı.

**Kalabalık türler parçalara bölünüyor.** Tek bir `InstancedMesh` sahnenin tamamını
kaplayan bir sınır küresine sahip olur ve hiçbir zaman ayıklanmaz — arkandaki 9 bin
yaprak da her karede işlenir. 1500'den kalabalık türler 4 × 4 konum kutusuna bölünüyor;
bedeli birkaç fazladan çizim çağrısı.

İki tür ilk denemede yanlış okundu, düzeltildi:

- **Deniz marulu** enden geniş ve yataya yakındı; ekranda yeşil bir pervane gibi
  duruyordu. Dört dar, dikine kalkan, kenarı dalgalı levha oldu.
- **Çalı yosunu** dalları 0,1 birim genişlikteydi ve kuru bir çalı çırpısına benziyordu.
  Dallar kalınlaştı, üstlerine yaprakçık eklendi, renk hardal sarısından zeytin-kahveye
  çekildi.

### Salınım CPU'dan vertex shader'ına (2026-09-22)

Çayır her karede CPU'da güncelleniyordu: 2600 yaprağın matrisi yeniden kuruluyor,
`instanceMatrix` baştan yükleniyordu. 13 822 bitkiyle aynı yaklaşım sürdürülemezdi.
Salınım `render/suShader.ts` içinde vertex shader'a taşındı — **kare başına CPU maliyeti
sıfır**, matrisler bir kez yazılıyor, yalnızca iki uniform değişiyor.

Yan kazanç görsel: matris döndürmesi yaprağı kökünden **düz** çeviriyordu, yaprak bir
çubuk gibi yatıyordu. Vertex kaydırması kökü sabit tutup ucu kaydırıyor — yaprak
gerçekten bükülüyor. Faz konuma bağlı olduğu için dalga çayırın içinden geçerek
ilerliyor (~150 birim dalga boyu).

Üç karar:

1. **`project_vertex` parçası değiştiriliyor, `begin_vertex` değil.** Büküm
   `instanceMatrix`'ten **sonra**, dünya ölçeğinde uygulanmalı. Öncesinde uygulansaydı
   kaydırma yaprağın kendi ölçeğiyle (boy 17-46, en 1,2-3) çarpılır ve her yaprak farklı
   miktarda bükülürdü.
2. **Esneklik köşe verisinde (`aEgilme`), uniform değil.** Tür başına uniform, tür başına
   ayrı malzeme ve ayrı shader programı demekti. Köşe verisiyle sekiz tür **tek malzeme,
   tek program** paylaşıyor ve bir bitkinin içinde bükülme değişebiliyor (şakayığın
   gövdesi katı, dokunaçları esnek).
3. **Her malzemeye benzersiz `customProgramCacheKey`.** Three.js derlenmiş programları
   malzeme parametrelerinden üretilen bir anahtarla paylaştırıyor
   (`WebGLRenderer.getProgram`); anahtar çakışırsa ikinci malzeme için `onBeforeCompile`
   **hiç çağrılmıyor** ve uniform'lar o malzemeye bağlanmıyor. Shader sessizce sıfır
   okur — hata vermez, sadece etki kaybolur. Bedel birkaç fazladan program derlemesi
   (sahnede toplam 11 program).

### Kaustik: iki sinüsün çarpımı değil, üç sinüs ailesinin en yakını (2026-09-22)

Kum üstündeki ışık ağı yol haritasındaydı, eklendi (`SU_KAUSTIK`, kum 2,4 · kaya 1,25).

İlk yazım iki sinüsün çarpımının kuvvetiydi. Ekranda ağ değil **tek yöne sıvanmış uzun
lekeler** çıktı, çünkü çarpımın tepe noktaları bir doğrultuda diziliyor. Çalışan biçim:
üç sinüs "duvar ailesi"nden **en yakınına** olan uzaklık (`min(abs(sin…))`) — üç aile
kesişince hücre oluşuyor. Üstüne alan büküm (`kNokta += vec2(sin…, cos…)`) düzenli ızgara
görüntüsünü kırıyor, ikinci ince katman ağın içine kıpırtı koyuyor.

Derinlik bandıyla modüle ediliyor (`uKaustikBant`): sığ sırtlarda belirgin, derin
çanaklarda sönük. `uGunduz` ile çarpıldığı için gece tamamen kayboluyor.

Kaustik **yalnızca kum, kaya ve çakılda** açık; bitkilerde değil. Çayır ekranın büyük
kısmını kaplıyor ve her piksel için ~50 ALU'luk desen hesabı fragment maliyetini boşuna
katlıyor.

### Su yüzeyi meğer hiç çizilmiyormuş (2026-09-22)

Yüzey düzlemi `rotateX(π/2)` + `side: BackSide` ile kuruluyordu. `rotateX(π/2)` düzlemin
**ön yüzünü aşağı** çeviriyor; yani alttan bakan oyuncu ön yüzü görüyor ve `BackSide` onu
ayıklıyor. Sonuç: yüzey hiçbir zaman görünmüyordu. Sis kapatılıp bakıldığında da hiçbir
şey çıkmadığı için hata buradan yakalandı — sisle açıklanamayan bir yokluktu.

`FrontSide` + `depthWrite: false` ile düzeltildi. Üstüne vertex dalgası ve fragment
pırıltısı eklendi (`yuzeyGolgesiUygula`); dalga boyu ~45 birim, ilk denemedeki 130 birim
su yüzeyi değil devasa lekeler gibi görünüyordu.

Ayrıca **ışık huzmeleri** eklendi (16 levha, toplamalı karışım, kameraya dönen billboard).
Huzme kendi sisini hesaplıyor: three.js'in sisi rengi sis rengine doğru **karıştırıyor**,
toplamalı karışımda bu uzaktaki huzmelerin sönmek yerine sahneyi beyazlatması demek.

### Parçacıklar artık oyuncuyu izliyor (2026-09-22)

Deniz karı ve kabarcıklar resif hacmine eşit dağılıyordu; hacim 5,4 kat büyüyünce görünür
yoğunluk beşte birine düştü ve su boşaldı. Sayıyı beşe katlamak yerine parçacıklar
**oyuncuyu izleyen bir kutuda** tutuluyor (kar ±190/±150 birim): kutudan çıkan tanecik
karşı kenardan giriyor. Görünür yoğunluk resif boyutundan bağımsız, maliyet sabit.
Tanecikler 190 birimde zaten yarım pikselden küçük olduğu için kutunun kenarı fark
edilmiyor. Kabarcıklar oyuncunun çevresindeki kumdan kalkıyor.

### Koordinat sistemi — iki dünya, tek dönüşüm

**Simülasyon kendi koordinatında kalıyor**: `y` yüzeyden aşağı artan derinlik
(0 = yüzey, 300 = dip). Ekosistem kodunun tamamı 2B sürümden birebir taşındı ve bu
düzene göre yazılmıştı. Three.js ise Y-yukarı çalışır.

İkisini her yerde karıştırmak yerine dönüşüm tek bir yerde: `core/dunya.ts` içindeki
`dunyaKonumu()`. **Yalnızca çizim katmanı bunu çağırıyor.** Yeni bir görsel eklerken
konumu simülasyon koordinatında hesaplayıp son anda dönüştür.

Resif 1180 × 360 × 820 birim (≈ 14 × 4,3 × 10 m). 1 birim ≈ 1,2 cm (çipura "Koca"
evresinde 48 birim ≈ 58 cm). İlk sürüm 600 × 300 × 400 idi; taban alanı 4,03 kat büyüdü
ve dekor/nüfus sayıları `ALAN_CARPANI` ile bu çarpana bağlandı.

### Omurga tabanlı prosedürel balık (`render/fish3d.ts`)

Projenin merkezi. Balık uç uca bağlı eklemlerden oluşan bir omurga; baş hareket eder,
gövde onu sabit mesafeyle ve en fazla `maksBukum` açıyla takip eder, üstüne yüzme
dalgası biner. Gövde bu omurga etrafındaki halkalardan örülen bir boru mesh'i.

Beş kritik nokta:

1. **Halkalar elips.** Dikey yarıçap tam, yatay yarıçap onun 0,42 katı
   (`YANAL_BASIKLIK`). Balığı balık yapan şey bu; daire kesitle sosis gibi görünüyor.
2. **Ters gölgeleme vertex renkleriyle.** Halka açısına göre üstte sırt, yanda yan,
   altta karın. Doku gerekmiyor.
3. **Göz de vertex rengi.** Ayrı bir küre balık başına iki draw call daha demekti;
   başın iki yanındaki köşeleri koyu boyamak yetiyor (`GOZ_EKLEMI`).
4. **Yüzgeçler aynı geometriye kaynatılı** → balık başına tek draw call.
5. **Gövde düz, kuyruk sallanır (carangiform).** Gövde dalgası düşük ve yalnızca arka
   %65'te; kuyruk yüzgecinin kendi salınımı bunun 4,5 katı. Dalgayı gövdeye yaymak
   yılan görüntüsü veriyor.

`yukari` vektörü yumuşatılarak taşınıyor: balık dikeye yaklaşınca dünya-yukarı ile
ileri yön çakışıyor ve çerçeve dejenere oluyor; düzeltilmezse balık kendi ekseninde
takla atıyor.

### Renk uzayı tuzağı (önemli)

Three.js r152+ ile **`Color.setRGB()` varsayılan olarak lineer-sRGB bekler.** Tablodaki
renkler sRGB (0-255). Dönüştürmeden yazınca her şey olması gerekenden parlak çıkıyor:
su solgun, sis etkisiz, gıdalar beyaz görünüyordu. Çözüm: her `setRGB` çağrısına
dördüncü argüman `SRGBColorSpace`. Vertex renkleri de aynı şekilde dönüştürülüyor
(`fish3d.ts` içindeki `renkYaz`).

Bu düzeltmeden sonra sahne doğal olarak koyulaşıyor; ışık şiddetleri ve tone mapping
pozlaması buna göre yükseltildi.

Sis rengi saf dip rengi yapılırsa su çamurlu görünüyor — Ege suyu berrak olduğu için
sis rengi yüzey rengine doğru %45 karıştırılıyor.

### Sürü davranışı (`game/school.ts`)

Klasik boids + su altı kuvvetleri, artık üç eksende. Sürü kuralları yalnızca **aynı
tür** arasında; ayrışma her türle (yoksa balıklar birbirinin içinden geçiyor).
Komşu araması artık **uzamsal ızgaradan** geliyor (`core/izgara.ts`): `kuvvetHesapla`
hazır bir aday listesi alıyor, tüm popülasyonu taramıyor. Ölçümler yukarıda.

### Ekosistem

- `species.ts`: 20 tür (Karadeniz + Akdeniz), her biri hem görünümünü hem davranışını
  tanımlıyor.
- Küçük gruplu türlerden en az bir birey garanti ediliyor; yoksa ağırlıklı kurada
  çıkmayıp resif sadece sürülerden ibaret kalıyor.
- `daynight.ts`: ~5 dk döngü, **sis yoğunluğunu ve ışıkları sürüyor**.
- **Plankton diel dikey göçü**: gündüz derine iner, gece yüzeye çıkar.
- Gıda habitata bağlı doğuyor; NPC balıklar da yiyor.

### Avlanma (tek yönlü)

Oyuncu boyunun yarısından küçük balıkları yer (`YENEBILIR_ORAN`, `npcFish.ts`).
Tersi yok. Yavru evrede (13 birim) sınır 6,5 — hiçbir balık o kadar küçük değil,
yani avlanamıyor. Menü büyüdükçe açılıyor.

### Performans — ölçülen değerler

Hepsi aynı makinede, `window.olc()` ve `window.ilerlet()` kancalarıyla. 60 fps bütçesi
16,7 ms.

| | 600×400 resif (2026-09-18) | 1180×820 resif (2026-09-22) |
|---|---|---|
| balık / gıda / bitki | 93 / 60 / 2600 | 216 / 202 / 13 822 |
| simülasyon (CPU, çizim hariç) | 2,70 ms | **6,10 ms** |
| güncelleme + çizim, medyan | 4,0 ms | **7,3 ms** |
| aynısı, p95 | 5,1 ms | **8,0 ms** |
| çizim çağrısı | 127 | 266 |
| üçgen | 65 bin | 360 bin |
| paket (gzip) | 150,8 kB | **156,6 kB** |

Kare bütçesinin %44'ü kullanılıyor. Bitki sayısı 5,3 kat arttığı hâlde bitkilerin CPU
maliyeti **sıfır** (salınım shader'da); artışın tamamı balık sayısından ve çizimden
geliyor.

> Kare süresini uçtan uca (güncelleme + çizim) senkron bir döngüde ölçmek **güvenilir
> değil**: ardışık `renderer.render()` çağrıları GPU kuyruğunu doldurduğu için
> `performance.now()` GPU beklemesini de sayıyor ve p95 şişiyor. Bu yüzden yalnızca
> CPU tarafı ölçülüyor; GPU tarafı draw call ve üçgen sayısıyla raporlanıyor.

### Geliştirme kancaları

`npm run dev` sırasında konsoldan: `window.dunya`, `window.girdi`, `window.sahne`,
`window.sabitler`, `window.duraklat(true/false)`, `window.ilerlet(adim)` (çizmeden
hızlı simülasyon), `window.olc(kare)`. `import.meta.env.DEV` içinde olduğu için
üretim derlemesinde tamamen atılıyor.

### Bilinen tuzaklar (otomasyonla test ederken)

- Arka plandaki sekmede `requestAnimationFrame` çalışmaz; oyun donmuş görünür ve
  rAF tabanlı ölçüm hiç veri toplamaz. Ölçümler senkron kancalarla yapılıyor.
- `duraklat(true)` çizimi durdurmuyor ama güncellemeyi durduruyor: sis/ışık son
  çizimdeki değerde kalıyor, sekme öne gelince güncelleniyor.
- Konsoldan `await import("/src/...")` modülün ayrı bir kopyasını verir; canlı
  değerler için `window` kancalarını kullan.
- **Konsol testinde `window` kancalarıyla aynı adı kullanma.** `javascript_tool`
  REPL semantiğinde top-level `function olc(){}` tanımlamak `window.olc` kancasını
  eziyor; ölçümler sessizce boş çıkıyor ve bu kod hatası gibi görünüyor (mesh hiç
  yazılmamış, oyuncu hiç hareket etmemiş gibi). Test yardımcılarına `yayilimOlc` gibi
  ayrı ad ver.
- **Claude in Chrome sekmesinde pointer lock çalışmıyor**: `requestPointerLock()`
  `WrongDocumentError: The root document of this element is not valid for pointer lock`
  ile reddediliyor (sayfa iframe'de değil, odaklı ve üst pencerede — yani sayfanın
  değil, otomasyon sekmesinin kısıtı). Fareyle sürüş yalnızca normal bir Chrome
  sekmesinde elle test edilebilir; klavye kısmı `ilerlet()` ile ölçülebiliyor.

## Yapılacaklar / Yol Haritası
- [x] Caustic (kum üstünde ışık ağı) ve ışık huzmeleri — 2026-09-22
- [ ] Uzaktaki balıkların gövde mesh'ini her karede değil üç karede bir güncellemek
      (kare maliyetinin en büyük kalemi: balık başına ~28 µs)
- [ ] Ses efektleri
- [ ] Paket bölme (three ayrı chunk) — ilk yükleme süresi için
- [ ] Mobil/dokunmatik kontrol
- [ ] İstenirse Hostinger'a statik yayın

<!-- Kimlik bilgilerini (şifre, API key, token, .env içeriği) BU DOSYAYA YAZMA. -->
