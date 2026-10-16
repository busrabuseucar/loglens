"""Run: python -m streamlit run app.py"""
from pathlib import Path

import pandas as pd
import streamlit as st

from loglens import analyze, parse_csv, report_csv
from loglens.engine import MAX_BYTES, timeline
from loglens.experiment import run_r3_experiment

ROOT = Path(__file__).resolve().parent
RULES = {
    "R1": ("Yoğun başarısız giriş", "Aynı IP'den 5 dakikada en az 5 başarısız giriş.", "Orta"),
    "R2": ("Çoklu hesap denemesi", "Aynı IP'den 10 dakikada en az 5 farklı hesaba başarısız giriş.", "Yüksek"),
    "R3": ("Hatalardan sonra başarılı giriş", "Aynı IP ve hesapta 5 dakikada en az 3 hatadan sonra başarı. Önceki başarı sayacı sıfırlar.", "Yüksek"),
}
st.set_page_config(page_title="LogLens | Giriş kaydı analizi", page_icon="🔎", layout="wide")
st.title("LogLens")
st.caption("Açıklanabilir giriş kaydı analizi · Python referans uygulaması")

with st.sidebar:
    st.subheader("Veri kaynağı")
    st.caption("Bu sürüm, CSV'yi uygulamanın çalıştığı Python sürecinde işler. Yerel çalıştırırsan veri bilgisayarında kalır. Barındırılan Streamlit sürümüne yüklenen dosya o sunucuda işlenir.")
    uploaded = st.file_uploader("CSV yükle", type=["csv"])
    sample = st.button("Örnek veriyi yükle", width="stretch")
    st.download_button("CSV şablonu indir", (ROOT / "dist/template.csv").read_bytes(), "loglens-template.csv", "text/csv")
    st.divider()
    st.caption("En fazla 2 MB / 20.000 kayıt. Desteklenen IP biçimi: IPv4. Tüm zamanlar UTC.")

if "parsed" not in st.session_state:
    st.session_state.parsed = parse_csv((ROOT / "dist/sample.csv").read_text())
    st.session_state.filename = "sample.csv · sentetik veri"
    st.session_state.upload_id = None

if sample:
    st.session_state.parsed = parse_csv((ROOT / "dist/sample.csv").read_text())
    st.session_state.filename = "sample.csv · sentetik veri"
    st.session_state.upload_id = uploaded.file_id if uploaded else None
elif uploaded is not None and uploaded.file_id != st.session_state.upload_id:
    st.session_state.upload_id = uploaded.file_id
    try:
        if uploaded.size > MAX_BYTES:
            raise ValueError("Dosya en fazla 2 MB olabilir.")
        parsed = parse_csv(uploaded.getvalue().decode("utf-8-sig"))
        if not parsed["events"]:
            raise ValueError("Dosyada geçerli kayıt yok. " + (parsed["errors"][0]["reason"] if parsed["errors"] else "Şablonu veriyle doldur."))
        st.session_state.parsed = parsed
        st.session_state.filename = uploaded.name
    except (UnicodeDecodeError, ValueError) as exc:
        st.error(f"{exc} Önceki analiz korunuyor.")

parsed = st.session_state.parsed
result = analyze(parsed["events"])
summary, alerts = result["summary"], result["alerts"]
st.info(f"{st.session_state.filename} · {len(parsed['events'])} geçerli kayıt")
if parsed["errors"] or parsed["duplicates"]:
    with st.expander(f"Veri kalitesi: {len(parsed['errors'])} hatalı kayıt · {parsed['duplicates']} tekrar"):
        st.caption("Hatalı kayıtlar analizden çıkarılır. Birebir aynı kayıtlar yalnızca bir kez sayılır.")
        if parsed["errors"]:
            st.dataframe(pd.DataFrame(parsed["errors"]), hide_index=True, width="stretch")

columns = st.columns(4)
for col, title, value in zip(columns, ["Toplam kayıt", "Başarısız giriş", "İncelenecek IP", "Toplam bulgu"], [summary["total"], summary["failure"], summary["flaggedIps"], len(alerts)]):
    col.metric(title, value)

overview, records_tab, rules_tab, experiment_tab = st.tabs(["Genel bakış", "Giriş kayıtları", "Kurallar", "R3 deneyi"])
frame = pd.DataFrame(parsed["events"])
with overview:
    st.subheader("Giriş hareketleri")
    chart = pd.DataFrame(timeline(parsed["events"])).set_index("timestamp")
    st.bar_chart(chart.rename(columns={"failure": "Başarısız", "success": "Başarılı"}))
    st.caption("UTC · En az 5 dakikalık, en fazla 288 zaman dilimi; uzun aralıklarda dilim genişliği artar.")
    st.subheader("İncelenecek bulgular")
    left, right = st.columns([2, 1])
    query = left.text_input("IP veya hesap ara")
    selected_rule = right.selectbox("Kural", ["Tümü", "R1", "R2", "R3"])
    filtered = [a for a in alerts if (selected_rule == "Tümü" or a["rule"] == selected_rule) and (not query or query.lower() in (a["ip"] + " " + " ".join(a["users"])).lower())]
    st.download_button("Görünen bulguları indir", "\ufeff" + report_csv(filtered), "loglens-findings.csv", "text/csv", disabled=not filtered)
    if not filtered:
        st.info("Eşleşen bulgu yok. Bu sonuç güvenlik garantisi değildir.")
    for a in filtered:
        title, description, level = RULES[a["rule"]]
        with st.expander(f"{level} · {a['rule']} · {a['ip']} · {title}"):
            st.write(description)
            st.write(f"{a['count']} kayıt · {len(a['users'])} hesap · {a['start']} → {a['end']}")
            st.dataframe(frame[frame["row"].isin(a["rows"])][["row", "timestamp", "ip", "username", "status", "source"]], hide_index=True, width="stretch")
    st.caption("Aynı kayıt birden fazla kuralı tetikleyebilir. Bulgular saldırı kanıtı değildir.")

with records_tab:
    st.dataframe(frame[["row", "timestamp", "ip", "username", "status", "source"]], hide_index=True, width="stretch")
with rules_tab:
    for key, (title, description, level) in RULES.items():
        st.subheader(f"{key} · {title}")
        st.write(description)
        st.caption(f"Önem: {level}. Pencerenin iki sınırı da dahil edilir.")
    st.markdown("**Gerekli sütunlar:** `timestamp,ip,username,status` · İsteğe bağlı: `source`.")
    st.code("2026-09-04T12:00:00+03:00,192.0.2.10,demo_user,failure,vpn", language="text")
    st.write("R1/R2 için IP başına en güçlü pencere; R3 için IP/hesap başına en güçlü olay gösterilir. Eşit güçte ilk olay tutulur. IPv6, ham loglar ve gerçek zamanlı izleme bu sürümün kapsamında değildir.")

with experiment_tab:
    st.subheader("Bir saniye neyi değiştirir?")
    st.write("Üç başarısız giriş sabit. Başarılı girişin zamanını değiştirerek R3'ün beş dakikalık penceresini incele.")
    st.caption("Sentetik örnek veri üzerinde çalışır. Yüklediğin dosyanın analizi değişmez. Hesap: demo_analyst · IP: 198.51.100.77")

    def preset_delay(seconds):
        st.session_state.r3_delay = seconds

    preset_columns = st.columns(4)
    for col, label, seconds in zip(preset_columns, ["Orijinal · 2:40", "Tam sınır · 5:00", "Sınır +1 sn · 5:01", "Geç giriş · 10:00"], [160, 300, 301, 600]):
        col.button(label, key=f"r3_preset_{seconds}", on_click=preset_delay, args=(seconds,), width="stretch")
    if "r3_delay" not in st.session_state:
        st.session_state.r3_delay = 160
    delay = st.slider("İlk hatadan başarıya kadar geçen süre (saniye)", min_value=160, max_value=600, step=1, key="r3_delay")
    exp = run_r3_experiment((ROOT / "dist/sample.csv").read_text(), delay)
    st.write(f"**Geçen süre:** {delay // 60} dk {delay % 60} sn · **Başarılı giriş:** {exp['successTimestamp'][11:19]} UTC")
    st.write(f"**Örnek veride toplam bulgu:** {exp['baselineFindings']} → {exp['findings']} · **Penceredeki hata sayısı:** {len(exp['inWindowRows'])} / 3")
    if exp["active"]:
        st.warning("R3 uyarısı var. Üç hata da başarıdan önceki 5 dakika içinde; tam sınırdaki kayıt dahil edilir.")
    else:
        st.info(f"R3 uyarısı yok. Başarıdan önceki 5 dakikada {len(exp['inWindowRows'])} hata kaldı; en az 3 gerekiyor.")
    evidence = pd.DataFrame(exp["evidence"])
    evidence["Pencere"] = ["Pencerenin sonu" if e["status"] == "success" else "Dahil" if e["row"] in exp["inWindowRows"] else "Pencere dışında" for e in exp["evidence"]]
    st.caption(f"İncelenen pencere: {exp['windowStart'][11:19]}–{exp['successTimestamp'][11:19]} UTC · iki sınır da dahil")
    st.dataframe(evidence[["timestamp", "status", "Pencere"]], hide_index=True, width="stretch")
    st.download_button("Deney CSV’sini indir", "\ufeff" + exp["csv"], f"loglens-r3-{delay}s.csv", "text/csv")
