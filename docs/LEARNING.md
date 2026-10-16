# LogLens — öğrenme ve demo planı

## İlk oturum: çalışan uygulamayı anlamak

1. Demoyu aç. Başlangıçta **161 kayıt, 28 başarısız giriş, 3 incelenecek IP, 4 bulgu** görmelisin.
2. `198.51.100.77` adresindeki **R3** bulgusunu aç. Üç başarısız denemeden sonra gelen başarılı kaydı bul.
3. **Kaynak kayıtlarını incele** ile dört kaydı karşılaştır. Aynı IP ve aynı hesabın neden gerekli olduğunu açıkla.
4. **Raporu indir** ile bulguları dışa aktar. Filtrelediğinde indirilen kayıt sayısının da değiştiğini kontrol et.
5. Örnek CSV'yi indir. Bir başarısız denemenin zamanını değiştir, kendi dosyanı yükle ve bulgudaki farkı yorumla.

## R3 deneyini panelde yap

1. **R3 deneyi** bölümünü aç. İlk durumda başarı 10:27:40 UTC'de; toplam bulgu 4.
2. **Tam sınır · 5:00** düğmesine bas. İlk hata tam beş dakika önce gerçekleştiği için hâlâ dahil; R3 devam eder.
3. **Sınır +1 sn · 5:01** düğmesine bas. İlk hata pencere dışına çıkar, sadece iki hata kalır. R3 kalkar; örnek veri için toplam bulgu 3 olur.
4. **Geç giriş · 10:00** seçeneğini dene. Üç hata da pencere dışında kalır.
5. **Deney CSV’sini indir**, ardından **Genel bakış → CSV yükle** ile bu dosyayı aç. Ekrandaki 3 bulguyla deney sonucunu karşılaştır.

Deney paneli sentetik örneğin ayrı bir kopyasını kullanır; yüklediğin dosyayı değiştirmez. Kayan pencere başarı anından geriye bakar. Beş dakikalık tek bir sabit takvim bloğuna bakmaz.

## Bir günlük çalışma akışı

| Süre | Yapılacak iş | Tamamlanma kanıtı |
| --- | --- | --- |
| 45 dk | Python ortamını kur, örnek veriyi çalıştır | Streamlit ekranındaki dört metrik |
| 60 dk | `parse_csv` fonksiyonunu oku | Hatalı satır ve tekrar kaydı farkını açıklayabilmek |
| 90 dk | R1'in kayan pencere mantığını öğren | Beş dakika sınırındaki testi açıklayabilmek |
| 60 dk | R2 ile R3'ü incele | Aynı IP, farklı hesap ve başarı sıfırlamasını açıklamak |
| 60 dk | Örnek CSV ile kendi senaryolarını üret | Bir pozitif ve bir yanlış alarm senaryosu |
| 45 dk | Bir küçük iyileştirme yap | Anlaşılır bir commit ve geçen testler |
| 45 dk | Demo kaydı ve README'yi tamamla | 60–90 saniyelik video ve kurulum adımları |
| 15 dk | GitHub ve CV sunumunu kontrol et | Açılan bağlantılar, doğru katkı açıklaması |

## 60–90 saniyelik demo akışı

- **0–15 saniye:** “LogLens, CSV giriş kayıtlarını açıklanabilir kurallarla inceliyor.” Örnek veri etiketini göster.
- **15–35 saniye:** R3 bulgusunu aç. Hesap, IP, zaman aralığı ve üç hatadan sonraki başarıyı göster.
- **35–55 saniye:** İlgili kayıtları aç; ardından örnek CSV'de bir zaman değerini değiştirip tekrar yükle.
- **55–75 saniye:** Bulguları filtrele ve CSV raporunu indir.
- **75–90 saniye:** “Bu bir eğitim MVP'si; uyarı, saldırı kanıtı değil.” Testleri ve Python kaynağını göster.

## İlk kişisel katkın için küçük görev

**R1 eşiğini önce 5'ten 6'ya değiştir ve değişen bulguları açıklamaya çalış.** Bunu bir deney dalında yap; `main` dalındaki sözleşmeyi rastgele değiştirme. Python ve JavaScript motorlarını birlikte güncelle. Sınır testlerinin hangi nedenle değişmesi gerektiğini açıklayamıyorsan kodu henüz tam anlamamışsındır.

Bu egzersizden sonra R1'i varsayılan 5 eşiğine geri getir. İkinci küçük katkı olarak kullanıcıya hatalı kayıtları CSV olarak indirme olanağı ekleyebilirsin. Bu özellik mevcut MVP'de yok; sonraki sürüm görevidir.

## Mülakatta açıklayabilmen gerekenler

- Neden sabit takvim blokları yerine kayan pencere kullandın?
- Beş dakika sınırının tam üzerindeki olay neden dahil?
- Tekrar kayıtlarını silmeseydin hangi yanlış bulgular oluşurdu?
- Ortak IP kullanan bir kurum bu kuralları neden tetikleyebilir?
- R2 neden toplam deneme sayısını değil farklı hesapları sayıyor?
- R3 neden her başarılı girişten sonra sayacı sıfırlıyor?
- Tarayıcı sürümüyle sunucuda barındırılan Streamlit'in veri gizliliği farkı ne?
- CSV hücreleri `=` ile başladığında dışa aktarım neden önlem alıyor?
- İki analiz motorunun aynı davrandığını nasıl doğruluyorsun?

## CV için sınır

Projeyi anlayıp kişisel katkını yaptıktan sonra, yaptığın işi **kural tabanlı log analizi, CSV doğrulama, kaynak kayıtlarla açıklama ve test otomasyonu** olarak anlatabilirsin. Bunu “yapay zekâ ile saldırıları kesin tespit eden üretim sistemi” diye yazma. Gerçek kullanıcı, sahada doğrulanmış başarı oranı ve üretim deneyimi bu MVP'de yok.

Kendi geliştirdiğin bölümleri ve araç kullanımını dürüstçe ayır; çalıştırmadığın veya açıklayamadığın bir şeyi kişisel yetkinlik olarak sunma.
