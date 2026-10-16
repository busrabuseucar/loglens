# İşletim ve sürüm doğrulama — Yerel giriş kaydı analizi

Son inceleme: **16 Ekim 2026**. Bu belge kurulum, veri akışı, sürüm kapıları, geri dönüş ve doğrulama kapsamını birlikte kaydeder. Bir yayın adresinin açılması, tüm üretim koşullarının tamamlandığı anlamına gelmez.

## Sürüm kanıtı

- Denetlenen uygulama commit’i: `432399fa58debaafb8c4ef5908e2d39f045809b2`.
- [Bu commit için başarılı CI kaydı](https://github.com/busrabuseucar/loglens/actions/runs/38907471594).
- Doğrulanan otomatik kapsam: 21 Python + 11 Node + 4 tarayıcı testi; 44 eşdeğerlik örneği.
- Testlerin gerçek servis, veri veya donanım yerine taklit kullandığı noktalar aşağıda açıkça ayrılmıştır.

## Kurulum ve çalışma

Depo kökünde, README’deki çalışma zamanı sürümüyle:

```sh
npm ci
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python scripts/package_source.py
npm test
npm run test:parity
```

Veri akışı: CSV giriş kayıtları → ortak kuralların Python/JavaScript uygulamaları → kanıtlı bulgular.

Yapılandırma: Statik dist tarayıcı demosu ve ayrı yerel Streamlit uygulaması. Eğitilmiş model veya SIEM bağlantısı yok.

## Yayın ve geri dönüş

1. Temiz checkout ve kilitli bağımlılıklarla yukarıdaki kontrolleri çalıştır. İlgili CI başarısını commit SHA ile eşleştir.
2. Yayın paketine yalnızca çalışma zamanı dosyalarını koy. Secret, ham kullanıcı verisi, yerel veritabanı ve kişisel hazırlık notları pakete girmemeli.
3. Hedef proje, kaynak commit, ortam ve yayın sürümünü kaydet. Önceki çalışan sürüm kimliğini geri dönüş için koru.
4. Yayından sonra ana kullanıcı akışını, hata durumunu ve varsa kalıcılığı doğrula. Sunucu hatası/yanlış sonuçta yeni yazmaları durdur; önceki doğrulanmış yayını geri al.
5. Şema değiştiyse yalnızca kodu geri almak yeterli değildir. Yedekten ayrı ortamda doğrulama yapmadan canlı veri üzerine yazma.

## Veri saklama ve kurtarma

Kaynak CSV ve dışa aktarılan raporu kullanıcı saklar. Tarayıcıya yüklenen hassas logları sunucu kaydı veya telemetry içine ekleme.

## Gerçek servis, model ve cihaz doğrulaması

Bulgular belirli zaman penceresi kurallarıdır; saldırının gerçekleştiğine dair kesin hüküm değildir. Python ve JS eşdeğerliği yeni kurallarda yeniden çalıştırılmalı.

## Yayın sonrası gözlem

Önce küçük ve sentetik girdilerle temel akışı kontrol et. Beklenmeyen hata, boş ekran, yanlış hesap, yetkisiz erişim veya veri kaybında tarih, uygulama commit’i, ortam ve yeniden üretme adımlarını kaydet; kişisel veri ve secret ekleme. Statik araçlarda tarayıcı konsolu/ağ hatalarını; backend bulunan projelerde durum kodu, gecikme ve hata oranını incele. Bu belgede sürekli izleme veya otomatik geri dönüş kurulmuş olduğu iddia edilmez.

## Kabul kaydı

Her yeni sürümün kaydı; test komutu/sonucu, kaynak SHA, yayın sürümü, gerçek servis/model sürümü, cihaz/işletim sistemi, veri kümesi özeti ve geri dönüş denemesini içermeli. Erişim veya fiziksel donanım yoksa ilgili satır **çalıştırılmadı** olarak tutulur; otomatik test başarısı yerine geçirilmez.
