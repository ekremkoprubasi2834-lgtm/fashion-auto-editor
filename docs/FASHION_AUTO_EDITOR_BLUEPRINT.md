# Fashion Auto Editor Blueprint

## 1. Projenin Amacı

Fashion Auto Editor, Almanca, Ispanyolca ve Ingilizce kadin moda YouTube kanallari icin icerik uretimini hizlandiran ve daha stratejik hale getiren local-first bir aractir.

Sistemin uzun vadeli amaci; rakip video sinyali analizi, ozgun metin uretimi, voiceover transcribe, gorsel planlama, Pinterest tarzi asset bulma, yatay YouTube video layout, muzik loop, altyazi ve final MP4 render sureclerine yardimci olmaktir.

Bu arac, kopya icerik uretmek icin degil, izleyici ihtiyacini ve YouTube performans sinyallerini daha iyi okuyarak ozgun, guvenli ve uygulanabilir moda videolari uretmek icin tasarlanir.

## 2. Hedef Kullanici Akisi

Hedef akis:

1. Kullanici voiceover dosyasini `input/voiceover.mp3` olarak ekler.
2. Sistem voiceover dosyasini transcript'e cevirir.
3. Transcript chapter, item ve scene yapilarina ayrilir.
4. Her scene icin visual intent, gorsel arama kelimeleri ve layout onerisi uretilir.
5. Altyazi, editing guide, timeline ve render hazirlik dosyalari olusturulur.
6. Ileride sistem muzik, layout ve FFmpeg render katmanlariyla `output/final_preview.mp4` uretir.
7. CapCut sadece opsiyonel son rotus araci olarak kalir.

Mevcut uygulama su output dosyalarini destekler:

- `output/transcript.txt`
- `output/scene_segments.json`
- `output/visual_timeline.csv`
- `output/editing_guide.md`
- `output/subtitles.srt`

OpenAI transcript islemi hata verirse sistem dev transcript fallback modunu kullanabilir.

## 3. Video Formati

Varsayilan video formati YouTube yatay long-form olmalidir:

- Cozunurluk: `1920x1080`
- Oran: `16:9`
- Sure: 5-8 dakika
- Ana kullanim: YouTube long-form moda videolari
- Ana yapi: hook, problem, vaat, item/chapter anlatimi, recap, yorum sorusu ve abone cagrisidir.

Kisa dikey sosyal medya formati bu projenin varsayilan hedefi degildir. Pinterest gibi dikey asset kaynaklari kullanilsa bile final video yatay YouTube layout'una uygun planlanmalidir.

## 4. Rakip Video Sinyali Stratejisi

Rakip metinleri kopyalanmayacak.

Rakip videolar sadece sinyal olarak kullanilacak:

- Konu secimi
- Hook yapisi
- Baslik stili
- Thumbnail dili
- Izleyici problemi
- Format
- Pace ve retention kalibi
- Comment tetikleyen tartisma noktasi

Rakip video sinyali, ozgun video fikri uretmek icin analiz edilir. Rakip voiceover metni, cumle yapisi veya anlatim sirasinin kopyalanmasina izin verilmez.

## 5. Metin Strateji Motoru

Metinler ozgun olacak; retention, YouTube guvenligi ve kanal guveni icin yazilacaktir.

Metin strateji motoru sunlari hedeflemelidir:

- Izleyiciye net bir problem ve vaat sunmak
- Videonun ilk 30 saniyesinde gereksiz girisi azaltmak
- Her maddeyi somut, uygulanabilir ve gorsellestirilebilir hale getirmek
- Kanalin moda otoritesini guclendirmek
- Asiri iddia, korku, utandirma veya yaniltici vaatlerden kacinmak
- Dil, yas grubu ve ulke kulturune uygun moda terimleri kullanmak

Metin izleyici icin yazilacak, gorsel arama kelimeleri ayri bir katman olarak uretilecektir.

## 6. Story + Visual Anchor Yontemi

Her scene sadece metin parcasi degil, ayni zamanda bir visual anchor tasimalidir.

Story katmani sunlari tanimlar:

- Izleyici problemi
- Moda prensibi
- Ornek durum
- Yapilacak ve kacinilacak kombin
- Mini sonuc veya gecis cumlesi

Visual anchor katmani sunlari tanimlar:

- Gosterilecek kiyafet parcasi
- Renk, kumas, kesim veya aksesuar
- Once/sonra veya dogru/yanlis karsilastirmasi
- Moodboard veya recap ihtiyaci
- Pinterest ya da asset arama niyeti

Bu yontem, metnin gorsele sonradan uydurulmasi yerine her sahnenin bastan gorsel olarak planlanmasini saglar.

## 7. Retention Sistemi

Retention sistemi videonun izlenme suresini artirmak icin stratejik gecisler ve bilgi aciklari uretmelidir.

Temel retention prensipleri:

- Ilk 30 saniyede hook, problem ve vaat disina cikilmaz.
- Her bolum basinda izleyiciye neden izlemeye devam etmesi gerektigi hatirlatilir.
- Gereksiz tekrarlar kesilir.
- Her madde yeni bir karar, hata veya donusum hissi vermelidir.
- Recap bolumu izleyicinin videoyu bitirmesini kolaylastirir.
- Sonraki video beklentisi orta veya final bolumunde tetiklenebilir.

Retention, manipule edici cliffhanger yerine gercek fayda ve net ilerleme hissiyle kurulmalidir.

## 8. Abone Donusum Sistemi

Abone cagrisi sadece sona birakilmayacak.

Subscriber conversion yapisi:

- `0:00-0:30`: Sadece hook, problem ve vaat.
- Ilk faydali maddeden sonra: Yumusak kanal vaadi ve abone sebebi.
- Orta bolum: Yorum tetikleyici veya sonraki video beklentisi.
- Final: Yorum sorusu, kanal vaadi ve abone cagrisi.

Abone cagrisi, izleyiciye kanal vaadini net anlatmalidir. Ornek vaat: daha elegant, gepflegt ve hochwertig gorunmek icin pratik moda kararlarina yardim etmek.

## 9. Yorum Tetikleme Sistemi

Yorum almak icin dil hatasi kullanilmayacak.

Bunun yerine bilincli moda tartismasi acan sorular kullanilacak:

- Findest du weiße Hosen elegant oder zu riskant?
- Würdest du dieses Piece im Sommer tragen?
- Welche Farbe wirkt für dich hochwertiger?
- Welche Styling-Regel findest du überholt?
- Soll ich als Nächstes zeigen, welche Sommerteile schnell billig wirken?
- Findest du Polka Dots elegant oder altmodisch?

Yorum sorulari dogal, konuyla ilgili ve izleyicinin kendi stil kararini paylasmasina uygun olmalidir.

## 10. YouTube Politika ve Guven Kontrolu

Sistem YouTube guveni ve izleyici guveni icin metinleri kontrol etmelidir.

Kacinilmasi gerekenler:

- Kopya veya cok yakin rakip metni
- Yaniltici vaat
- Asiri korku dili
- Yas, beden veya gorunum uzerinden utandirma
- Tik tuzagi baslik ve thumbnail vaatleri
- Moda tavsiyesini kesin ve evrensel dogru gibi sunmak

Moda tavsiyeleri tercih, baglam, vucut tipi, yasam tarzi ve kultur farklarini kabul eden bir dille yazilmalidir.

## 11. AI Humanization Pass

AI Humanization Pass, metnin yapay, ceviri kokan veya fazla jenerik duyulmasini engellemelidir.

Kontrol noktalar:

- Dogal konusma ritmi
- Hedef dile uygun moda terimleri
- Gereksiz dramatik ifadelerin temizlenmesi
- Benzer cumle kaliplarinin azaltilmasi
- Izleyiciye dogrudan ve saygili hitap
- Kanalin tekrar eden DNA'sina uygun ton

Bu pass, metni daha insani yaparken stratejik yapiyi bozmamalidir.

## 12. Chapter / Item / Scene Yapisi

Video hiyerarsisi uc katmanli planlanmalidir:

- Chapter: Videodaki ana bolum.
- Item: Liste videosundaki her moda parcasi, renk, kural veya hata.
- Scene: Timeline uzerinde gorsel ve altyazi ile eslesen kisa anlati parcasi.

Her item bir veya daha fazla scene icerebilir. Her scene su alanlara sahip olmalidir:

- Zaman araligi
- Voiceover metni
- Visual anchor
- Visual intent
- Layout tipi
- Altyazi parcasi
- Gerekirse policy veya QA notu

## 13. Visual Intent ve Pinterest Keyword Sistemi

Visual intent, metnin anlatmak istedigi moda fikrini gorsel arama ve layout planina cevirir.

Metin izleyici icin yazilir; keywordler ise ayri bir sistem katmanidir.

Keyword sistemi sunlari uretmelidir:

- Pinterest arama kelimeleri
- Renk, kumas ve kesim varyasyonlari
- Yas grubuna uygun stil kelimeleri
- Ulke ve dil bazli moda terimleri
- Avoid keywords veya riskli terim notlari
- Layout icin gerekli gorsel sayisi

Ornek:

- Metin: "Leinenblusen wirken im Sommer gepflegt, ohne zu streng auszusehen."
- Visual intent: Mature summer linen blouse outfit, elegant and relaxed.
- Pinterest keywords: `Leinenbluse Sommer Outfit Damen 55`, `elegante Leinenbluse weiße Hose`, `gepflegter Sommerlook Damen`.

## 14. Yatay Layout Motoru

Pinterest gorselleri cogunlukla dikey oldugu icin sistem yatay YouTube formati icin ozel layoutlar desteklemelidir.

Desteklenmesi gereken layoutlar:

- Tek dikey gorsel + blurred background
- Iki gorsel karsilastirma layout'u
- Uc gorsel moodboard layout'u
- Recap grid layout'u

Layout motoru su kurallari gozetmelidir:

- Final canvas `1920x1080` olmalidir.
- Dikey gorseller kirpilmadan veya kontrollu kirpilerek yerlestirilmelidir.
- Metin, altyazi ve gorsel odaklari birbirini kapatmamalidir.
- Karsilastirma sahnelerinde once/sonra veya dogru/yanlis ayrimi net olmalidir.
- Recap grid, video sonunda maddeleri hizli hatirlatmalidir.

## 15. Muzik Motoru

Muzik opsiyonel olacak: `input/music.mp3`.

Muzik motoru sunlari desteklemelidir:

- Muzik dosyasi yoksa sessiz background music modu.
- Muzik videodan kisa ise loop.
- Loop gecislerinde crossfade.
- Voiceover'i bastirmayacak dusuk ses seviyesi.
- Intro, body ve final bolumlerinde gerekirse farkli volume automation.

Muzik hicbir zaman voiceover anlasilirligini dusurmemelidir.

## 16. MP4 Render Motoru

Sistem ileride FFmpeg ile `output/final_preview.mp4` uretmelidir.

Render motoru sunlari birlestirmelidir:

- Voiceover
- Opsiyonel muzik
- Gorsel layoutlar
- Scene timing
- Subtitles
- Recap veya end screen bolumu

CapCut ana export icin zorunlu olmamali, sadece son rotus icin opsiyonel olmalidir.

## 17. Beklenen Output Dosyalari

Mevcut ve hedef output dosyalari:

- `output/transcript.txt`: Voiceover transcript.
- `output/scene_segments.json`: Scene bazli zaman ve metin parcalari.
- `output/visual_timeline.csv`: Editing ve gorsel planlama tablosu.
- `output/editing_guide.md`: Editor icin okunabilir rehber.
- `output/subtitles.srt`: YouTube uyumlu altyazi dosyasi.
- `output/visual_intents.json`: Ileride her scene icin visual intent ve keywordler.
- `output/layout_plan.json`: Ileride layout motoru icin plan.
- `output/quality_report.md`: Ileride kalite, dil ve tutarlilik raporu.
- `output/policy_report.md`: Ileride YouTube guven ve politika kontrol raporu.
- `output/final_preview.mp4`: Ileride FFmpeg ile uretilen preview render.

## 18. Quality Report ve Policy Report

Quality Report sunlari kontrol etmelidir:

- Baslik, intro, body ve outro sayi tutarliligi
- Dil dogalligi
- Hedef kitleye uygun moda terimleri
- Scene basina gorsel uygulanabilirlik
- Retention yapisi
- Abone ve yorum tetikleme noktalari

Policy Report sunlari kontrol etmelidir:

- Kopya metin riski
- Yaniltici vaat riski
- Asiri negatif veya utandirici dil
- YouTube guvenine zarar verebilecek ifade
- Rakip sinyalinin etik kullanimi

## 19. Cok Dilli Destek

Proje Almanca, Ispanyolca ve Ingilizce kadin moda kanallarini desteklemelidir.

Her dil icin ayri kontrol katmanlari gerekir:

- Dogal moda terminolojisi
- Ulke ve yas grubu hassasiyeti
- Baslik kaliplari
- Yorum sorulari
- Thumbnail dili
- Subscriber conversion dili

Almanca kanal icin Almanya merkezli, 55+ kadin kitleye uygun ton ve kelime secimi onceliklidir.

## 20. Gelistirme Yol Haritasi

Onerilen yol haritasi:

1. Mevcut transcript ve scene segment sistemini stabilize etmek.
2. Count Consistency Check eklemek.
3. German Fashion QA Pass eklemek.
4. Visual intent ve Pinterest keyword katmanini eklemek.
5. Layout plan JSON yapisini tanimlamak.
6. Yatay layout render prototipi olusturmak.
7. Muzik loop ve crossfade motorunu eklemek.
8. FFmpeg ile `output/final_preview.mp4` preview render uretmek.
9. Quality Report ve Policy Report uretmek.
10. Rakip video sinyali analizini etik ve ozgun metin motoruna baglamak.
11. Cok dilli metin QA kurallarini genisletmek.
12. CapCut opsiyonel son rotus akisini belgelemek.

## 26. German Channel Growth & Trust System

Bu bolum Almanca kadin moda kanali icin buyume, guven, izlenme kalitesi ve yorum/abone donusum sistemini kalici kanal standardi olarak tanimlar.

### 26.1 German Channel DNA

Hedef kitle ve dil:

- Ana hedef: 35-55 yas arasi kadinlar.
- Mevcut veride guclu sinyal: 55+ kadin izleyici.
- Dil: 35-55 arasi kadinlara hitap eden, zarif, saygili, dogal Almanca.
- Ana ulke: Almanya.
- Ana vaat: Daha fazla kiyafet almak degil, daha dogru styling kararlariyla daha gepflegt, eleganter, hochwertiger ve stilvoll gorunmek.
- Ana korkular: billig, alt, unmodern, fazla casual veya yanlis kombinlenmis gorunmek.

Kanal guveni su prensiplerle buyumelidir:

- Izleyiciye ustten bakan degil, yardim eden bir ton.
- Yas grubunu problem gibi gostermeyen, stil kararlarina odaklanan anlatim.
- "Pahali gorunmek" vaadini para harcamaya degil, daha iyi kombin kararlarina baglamak.
- Her videoda uygulanabilir, gercek hayata uygun moda faydasi vermek.
- Baslikta verilen vaadi videonun icinde eksiksiz karsilamak.

### 26.2 Winning Video Formula

Kazanan video sinyali:

- Video: `Die 4 Sommer-Pieces, mit denen du sofort teurer aussiehst (2026)`
- 15,6K goruntuleme
- 203K gosterim
- %6,1 CTR
- 2:20 ortalama izleme suresi
- %35,9 retention
- 20 yorum

Calisan Almanca kelimeler:

- eleganter
- hochwertiger
- gepflegter
- teurer
- stilvoll
- sofort
- wirken
- Sommer-Pieces
- Sommerteile
- Styling-Fehler

Guclu formatlar:

- `Die 4 Sommer-Pieces, mit denen du sofort teurer aussiehst`
- `5 Sommerteile, die dich sofort eleganter und hochwertiger wirken lassen`
- `6 Styling-Fehler, die Frauen im Sommer weniger elegant wirken lassen`
- `4 Farben, die dich sofort frischer und gepflegter aussehen lassen`
- `5 einfache Outfit-Regeln, mit denen du nie billig wirkst`

### 26.3 German Fashion QA Pass

Almanca metinler dogal Alman moda dili acisindan kontrol edilmelidir.

Zorunlu kontroller:

- Moda terimleri Almanya'da dogal mi?
- Dil 35-55 yas arasi kadinlara saygili, zarif ve dogal mi?
- 55+ izleyici sinyali dikkate aliniyor ama kitle sadece 55+ gibi daraltilmiyor mu?
- Ceviri kokan kelimeler var mi?
- Baslik ve metin ayni vaadi mi veriyor?
- `billig`, `älter` veya `falsch` gibi kelimeler utandirici degil, stil baglaminda mi kullaniliyor?
- `Hemden` kelimesi her baglamda dogru degildir; cogu kadin moda baglaminda `Blusen`, `Hemdblusen` veya `Leinenblusen` daha uygundur.

Kacinilmasi gereken ceviri ve AI hatalari:

- `Satanbluse` yerine `Satinbluse`.
- `Saturack` yerine `Satinrock`.
- `Maxick` yerine `Maxirock`.
- `Polkadotz` yerine `Polka Dots` veya `Pünktchenmuster`.
- `Widelhosen` yerine `weite Hosen`.
- `Whiteelh Hosen` yerine `weiße Hosen`.
- `Satops` yerine `Satin-Tops`.
- `Teilie` yerine `Taille`.
- `Passformzelt` yerine `Passform zählt`.

### 26.4 Count Consistency Check

Baslik, intro, madde sayisi ve outro tutarli olmalidir.

Baslikta 5 parca deniyorsa:

- Intro 5 parca vaadi vermeli.
- Body gercekten 5 madde icermeli.
- Recap 5 maddeyi hatirlatmali.
- Outro ayni sayiyi kullanmali.
- Thumbnail veya description icindeki sayi farkli olmamali.

Asla su tutarsizliga izin verilmemelidir:

- `title = 4`
- `intro = 7`
- `body = 4`
- `outro = 7`

Sayi tutarsizligi varsa metin final kalite kontrolunden gecmemelidir.

### 26.5 Comment Trigger Engine

Yorum almak icin dil hatasi kullanilmayacak. Hata ile yorum alinmayacak.

Yorum icin bilincli moda tartismasi kullanilacak:

- Findest du weiße Hosen elegant oder zu riskant?
- Würdest du dieses Piece im Sommer tragen?
- Welche Farbe wirkt für dich hochwertiger?
- Welche Styling-Regel findest du überholt?
- Soll ich als Nächstes zeigen, welche Sommerteile schnell billig wirken?
- Findest du Polka Dots elegant oder altmodisch?

Comment trigger sorulari:

- Videodaki konuya dogrudan bagli olmali.
- Izleyiciyi duzeltme yapmaya degil, fikir belirtmeye davet etmeli.
- Moda zevki, risk algisi, renk tercihi veya stil kurali uzerinden tartisma acmali.
- Kanalin sonraki video fikirlerine sinyal uretmelidir.
- Orta bolumde bir yorum tetikleyici bulunmalidir.
- Finalde spesifik yorum sorusu bulunmalidir.

### 26.6 Subscriber Conversion Engine

Subscriber CTA sadece sona birakilmayacak.

Yapi:

- `0:00-0:30`: Sadece hook, problem ve vaat. Ilk 20-30 saniyede abone istenmeyecek.
- Ilk faydali maddeden sonra: Yumusak kanal vaadi ve abone sebebi.
- Orta bolum: Yorum tetikleyici veya sonraki video beklentisi.
- Final: Spesifik yorum sorusu, kanal vaadi ve abonelik cagrisi.

Abone cagrisi su soruya cevap vermelidir:

`Bu kanala abone olursam bundan sonra hangi konuda surekli fayda alacagim?`

Almanca kanal icin cevap net olmalidir: Daha elegant, gepflegt, hochwertig ve stilvoll gorunmek icin kolay uygulanabilir moda kurallari.

### 26.7 Trust Check

Trust Check su kurallari zorunlu olarak denetlemelidir:

- Basliktaki vaat video icinde gercekten karsilaniyor mu?
- Kitleye saygili, yargilamayan ve yardim eden ton korunuyor mu?
- "Daha pahali gorunmek" para harcama baskisina degil, styling kararlarina baglaniyor mu?
- Genel moda havasi yerine uygulanabilir kombin kararlari veriliyor mu?
- Moda dili dogal Almanca mi?
- Yaniltici, abartili veya guven kiran iddia var mi?
- Voiceover-gorsel eslesmesi birebir kontrol edildi mi?

### 26.8 Mid-Video Retention Boost

Orta bolumde retention dususunu azaltmak icin video monoton liste gibi akmamalidir.

Mid-video boost secenekleri:

- Kisa bir karsilastirma: `Das wirkt schnell casual, aber so sieht es sofort gepflegter aus.`
- Bilincli yorum tetikleyici: `Welche Variante würdest du tragen?`
- Sonraki maddeye merak acigi: `Der nächste Punkt ist besonders wichtig, weil er ein Outfit sofort hochwertiger wirken lässt.`
- Yanlis/dogru styling ayrimi.
- Gorselde hafif zoom, pan veya comparison reveal gibi zarif motion.

### 26.9 New German Test Video Direction

Yeni test video yonu:

- Baslik: `5 Sommerteile, die dich sofort eleganter und hochwertiger wirken lassen`
- Thumbnail:
  - `SO WIRKST DU`
  - `SOFORT`
  - `ELEGANTER`

Madde onerisi:

1. Leichte Blusen und Hemdblusen
2. Weiße Hosen mit guter Passform
3. Fließende Midiröcke oder Maxiröcke
4. Hochwertige Tops aus Satin, Viskose oder Seide
5. Strukturierte Westen oder leichte Sommerblazer

Bu testte "Hemden" ana kelime olarak kullanilmamali; kadin moda baglaminda `Blusen`, `Hemdblusen` ve `Leinenblusen` daha guvenli tercih edilmelidir.

### 26.10 German Channel Priority

Almanca kanal icin oncelik sirasi:

1. German Fashion QA Pass
2. Count Consistency Check
3. Comment Trigger Engine
4. Subscriber Conversion Engine
5. Trust Check
6. Mid-Video Retention Boost
7. Voiceover-Gorsel Eslesme Kontrolu

Voiceover-gorsel eslesme kurali:

- Gorsel, voiceover'in soyledigi kiyafetle birebir eslesmeli.
- Genel moda havasi yeterli kabul edilmemeli.
- `Bluse`, `Hemdbluse`, `Leinenbluse`, `Hose`, `Rock`, `Weste`, `Blazer`, `Satin-Top` gibi parcalar net gorunmeli.
- Voiceover `weiße Hose` diyorsa etek veya sort kabul edilmemeli.
- Voiceover `schwarze Hose` diyorsa siyah etek kabul edilmemeli.
- Voiceover `gelbe Bluse` veya `butter yellow Hemdbluse` diyorsa mavi/beyaz gomlek kabul edilmemeli.
