import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { authStore } from "../../store/authReactive";
import { t } from "../../store/i18n";
import apiClient from "../../lib/apiClient";
import { getPath, isGood, makeV, fmtMonthYearJp, mergeArrRiwayat, esc } from "../../lib/helpers_cv";

interface Props {
  waTarget: string;
  isOpen: boolean;
  onClose: () => void;
  /** A10 parity: fallback pas_photo baris kandidat saat uploads.photo master kosong
   *  (legacy renderCVAjaib: master uploads.photo dulu, lalu pasPhoto dari
   *  ALL_CANDIDATES). TabPelamar & CandidateDash meneruskan row.pasPhoto. */
  fotoFallback?: string;
}

const CSS = `
.cv-excel{width:100%;border-collapse:collapse;border:1.5px solid black;font-family:Arial,sans-serif;font-size:10px;font-weight:bold;color:black;line-height:1.2}
.cv-excel th,.cv-excel td{border:1px solid black;padding:3.5px 4px;vertical-align:middle}
.bg-amber{background-color:#faeec8!important}.val-center{text-align:center!important}
.val-left{text-align:left!important;padding-left:8px!important}.val-right{text-align:right!important}
.border-r-none{border-right:none!important}.border-l-none{border-left:none!important}
.border-lr-none{border-left:none!important;border-right:none!important}
.col-1{width:13%}.col-2{width:2%}.col-3{width:11%}
.col-4{width:19%}.col-5{width:21%}.col-6{width:18%}.col-7{width:16%}
@media print{@page{size:A4 portrait;margin:6mm}
body *{visibility:hidden!important}
#rirek-modal,#rirek-modal *{visibility:visible!important;color:black!important}
#rirek-modal{position:absolute!important;left:0!important;top:0!important;width:100%!important;height:auto!important;background:white!important;padding:0!important;margin:0!important;overflow:visible!important;display:block!important}
.print:hidden{display:none!important}
*{-webkit-print-color-adjust:exact!important;color-adjust:exact!important}
.cv-excel tr{page-break-inside:avoid}}
`;
const keyOf = {
  pendidikan: (e: Record<string, string>) => String((e.tingkat||"")+(e.sekolah||e.sekolah_id||e.nama_sekolah||"")).toLowerCase().replace(/[^a-z0-9]/g,""),
  pekerjaan: (e: Record<string, string>) => String((e.perusahaan||e.perusahaan_id||e.nama_perusahaan||"")+(e.jabatan||e.jabatan_id||"")).toLowerCase().replace(/[^a-z0-9]/g,""),
  keluarga: (e: Record<string, string>) => String(e.nama||"").toLowerCase().replace(/[^a-z0-9]/g,""),
};
function buildEduRows(eduList: Record<string, any>[], v: (...keys: string[]) => string) {
  let html = "";
  for (let i = 1; i <= 5; i++) {
    const p = {...(eduList[i-1]||{})};
    if(!isGood(p.masuk)&&isGood(p.tahun_masuk)) p.masuk=p.tahun_masuk;
    if(!isGood(p.lulus)&&isGood(p.tahun_lulus)) p.lulus=p.tahun_lulus;
    if(!isGood(p.sekolah)&&isGood(p.nama_sekolah)) p.sekolah=p.nama_sekolah;
    if(!isGood(p.jurusan_id)&&isGood(p.jurusan)) p.jurusan_id=p.jurusan;
    let m=isGood(p.masuk)?String(p.masuk):v("PENDIDIKAN"+i+"TAHUNMASUK");
    let l=isGood(p.lulus)?String(p.lulus):v("PENDIDIKAN"+i+"TAHUNLULUS");
    let s=isGood(p.sekolah)?String(p.sekolah):v("PENDIDIKAN"+i+"NAMASEKOLAH","PENDIDIKAN"+i+"SEKOLAHID");
    let sj=isGood(p.sekolah_jp)?String(p.sekolah_jp):v("PENDIDIKAN"+i+"SEKOLAHJP");
    let j=isGood(p.jurusan_id)?String(p.jurusan_id):v("PENDIDIKAN"+i+"JURUSAN","PENDIDIKAN"+i+"JURUSANID");
    let jj=isGood(p.jurusan_jp)?String(p.jurusan_jp):v("PENDIDIKAN"+i+"JURUSANJP");
    [m,l,s,j,sj,jj].forEach((x,idx,a)=>{if(a[idx]==="-")a[idx]="";});
    if(i>3&&!(s||m||l)) continue;
    const fs=sj?esc(s)+"<br><span style=\"font-size:8px;font-weight:normal;\">"+esc(sj)+"</span>":esc(s);
    const fj=jj?esc(j)+"<br><span style=\"font-size:8px;font-weight:normal;\">"+esc(jj)+"</span>":esc(j);
    html+="<tr><td class=\"val-center border-r-none\">"+esc(fmtMonthYearJp(m))+"</td><td class=\"val-center border-lr-none\">"+(m||l?"-":"")+"</td><td class=\"val-center border-l-none\">"+esc(fmtMonthYearJp(l))+"</td><td colspan=\"2\" class=\"val-center\">"+fs+"</td><td colspan=\"2\" class=\"val-center\">"+fj+"</td></tr>";
  }
  return html;
}
function buildJobRows(jobList: Record<string, any>[], v: (...keys: string[]) => string) {
  let html = "";
  for (let i = 1; i <= 3; i++) {
    const p = {...(jobList[i-1]||{})};
    if(!isGood(p.masuk)&&isGood(p.tahun_masuk)) p.masuk=p.tahun_masuk;
    if(!isGood(p.keluar)&&isGood(p.tahun_keluar)) p.keluar=p.tahun_keluar;
    if(!isGood(p.perusahaan)&&isGood(p.nama_perusahaan)) p.perusahaan=p.nama_perusahaan;
    let m=isGood(p.masuk)?String(p.masuk):v("PEKERJAAN"+i+"TAHUNMASUK");
    let k=isGood(p.keluar)?String(p.keluar):v("PEKERJAAN"+i+"TAHUNKELUAR");
    let pt=isGood(p.perusahaan)?String(p.perusahaan):v("PEKERJAAN"+i+"NAMAPERUSAHAAN","PEKERJAAN"+i+"PERUSAHAANID");
    let ptj=isGood(p.perusahaan_jp)?String(p.perusahaan_jp):v("PEKERJAAN"+i+"PERUSAHAANJP");
    let ker=isGood(p.jabatan)?String(p.jabatan):v("PEKERJAAN"+i+"JENISKERJA","PEKERJAAN"+i+"POSISI","PEKERJAAN"+i+"JABATANID");
    let kerj=isGood(p.jabatan_jp)?String(p.jabatan_jp):v("PEKERJAAN"+i+"JABATANJP");
    let gaji=isGood(p.gaji)?String(p.gaji):v("PEKERJAAN"+i+"GAJI");
    [m,k,pt,ker,gaji,ptj,kerj].forEach((x,idx,a)=>{if(a[idx]==="-")a[idx]="";});
    if(i>2&&!(pt||m||k)) continue;
    const kf=k.toUpperCase().includes("SEKARANG")||k.toUpperCase().includes("IMA")?"現在に至る":fmtMonthYearJp(k);
    const fpt=ptj?esc(pt)+"<br><span style=\"font-size:8px;font-weight:normal;\">"+esc(ptj)+"</span>":esc(pt);
    const fker=kerj?esc(ker)+"<br><span style=\"font-size:8px;font-weight:normal;\">"+esc(kerj)+"</span>":esc(ker);
    html+="<tr><td class=\"val-center border-r-none\">"+fmtMonthYearJp(m)+"</td><td class=\"val-center border-lr-none\">"+(m||k?"-":"")+"</td><td class=\"val-center border-l-none\">"+kf+"</td><td colspan=\"2\" class=\"val-center\">"+fpt+"</td><td class=\"val-center\">"+fker+"</td><td class=\"val-right pr-1\">"+(gaji?"¥   "+gaji:"¥        -")+"</td></tr>";
  }
  return html;
}

function buildFamRows(famList: Record<string, any>[], v: (...keys: string[]) => string) {
  let html = "";
  for (let i = 1; i <= 6; i++) {
    const p = {...(famList[i-1]||{})};
    if(!isGood(p.umur)&&isGood(p.usia)) p.umur=p.usia;
    let hub=isGood(p.hubungan)?String(p.hubungan):v("KELUARGA"+i+"HUBUNGANID","KELUARGA"+i+"HUBUNGAN");
    let hubj=isGood(p.hubungan_jp)?String(p.hubungan_jp):v("KELUARGA"+i+"HUBUNGANJP");
    let nm=isGood(p.nama)?String(p.nama):v("KELUARGA"+i+"NAMA");
    let u=isGood(p.umur)?String(p.umur):v("KELUARGA"+i+"USIA","KELUARGA"+i+"UMUR");
    let pk=isGood(p.pekerjaan)?String(p.pekerjaan):v("KELUARGA"+i+"PEKERJAANID","KELUARGA"+i+"PEKERJAAN");
    let pkj=isGood(p.pekerjaan_jp)?String(p.pekerjaan_jp):v("KELUARGA"+i+"PEKERJAANJP");
    let g=isGood(p.gaji)?String(p.gaji):v("KELUARGA"+i+"GAJI");
    [hub,nm,u,pk,g,hubj,pkj].forEach((x,idx,a)=>{if(a[idx]==="-")a[idx]="";});
    const fh=hubj?esc(hub.toUpperCase())+"  "+esc(hubj):esc(hub.toUpperCase());
    const fp=pkj?esc(pk)+"<br><span style=\"font-size:8px;font-weight:normal;\">"+esc(pkj)+"</span>":esc(pk);
    html+="<tr><td colspan=\"2\" class=\"val-center\">"+fh+"</td><td colspan=\"2\" class=\"val-center\">"+nm.toUpperCase()+"</td><td class=\"val-center\">"+(u?u+"歳":"")+"</td><td class=\"val-center\">"+fp+"</td><td class=\"val-right pr-1\">"+(g?"¥   "+g:"¥        -")+"</td></tr>";
  }
  return html;
}
function buildCvIdentitas(v: (...keys: string[]) => string) {
  const gen = String(v("GENDER","JENISKELAMIN","identitas.gender")).toUpperCase();
  const gStr = (gen.includes("PEREMPUAN")||gen.includes("WANITA")||gen.includes("CEWEK")||gen.includes("女")||gen==="W")?"PEREMPUAN (女)":gen==="-"?"":"LAKI LAKI (男)";
  const nik = String(v("STATUSPERNIKAHAN","STATUSNIKAH","PASANGAN","identitas.status_nikah","identitas.status_nikah_id")).toUpperCase();
  const nStr = (nik.includes("MENIKAH")&&!nik.includes("BELUM"))?"MENIKAH （已婚）":nik==="-"?"":"BELUM MENIKAH （未婚）";
  const jp = String(v("PERNAHKEJEPANG","PENGALAMANJEPANG","STATUSEKSJEPANG","wawancara.riwayat_jepang")).toUpperCase();
  const jStr = (!jp||jp==="-"||jp.includes("BELUM")||jp.includes("TIDAK")||jp==="NO")?(jp==="-"?"":"TIDAK （無）"):"ADA （有）";
  const ps = String(v("PASPOR","PASPORT","identitas.paspor")).toUpperCase();
  const pStr = (ps.includes("YA")||ps.includes("ADA")||ps.length>5)?"ADA （有）":"TIDAK （無）";
  const tg = String(v("TANGANDOMINAN","TANGAN","fisik.tangan_dominan")).toUpperCase();
  const tStr = tg.includes("KIRI")?"KIRI (左)":tg==="-"?"":"KANAN  (右)";
  let gd = v("GOLONGANDARAH","GOLDAR","identitas.golongan_darah"); if(gd==="-")gd="";
  let nr = v("id_kandidat","IDKANDIDAT","NOMOR","ID");
  if(nr!=="-"){const m=String(nr).match(/(\d{3,})$/);nr=m?"P - "+m[1]:nr;}else{nr="";}
  return {gStr,nStr,jStr,pStr,tStr,gd,nr};
}
function buildKertasA4(p: Record<string, any>) {
  const {v,foto,btn,tgl,wa,gS,nS,jS,pS,tS,gd,nr,edu,job,fam} = p;
  const E = (s: string) => esc(s);
  const tr = (cells: string[]) => "<tr>" + cells.map(c => c).join("") + "</tr>";
  const td = (txt: string, cls?: string, span?: number|string) => {let h="<td";if(cls)h+=" class=\""+cls+"\"";if(span)h+=" colspan=\""+span+"\"";return h+">"+txt+"</td>";};
  const amber = (txt: string, span?: number|string) => td(txt,"bg-amber val-center",span);
  const center = (txt: string, span?: number|string) => td(txt,"val-center",span);
  const left = (txt: string, span?: number|string) => td(txt,"val-left",span);
  const r = (txt: string) => td(txt,"val-right pr-1");
  const rs11 = (txt: string) => "<td colspan=\"3\" rowspan=\"11\" style=\"padding:0;vertical-align:top;\">"+txt+"</td>";
  let h = "<style>"+CSS+"</style>";
  h+="<div style=\"text-align:center;font-weight:bold;font-size:22px;letter-spacing:2px;\">実習生経歴書</div>";
  h+="<div style=\"text-align:center;font-weight:bold;font-size:18px;margin-bottom:2px;\">DAFTAR RIWAYAT HIDUP</div>";
  h+="<div style=\"text-align:right;font-size:10px;font-style:italic;margin-bottom:2px;\">Ver.2025</div>";
  h+="<table class=\"cv-excel\"><colgroup><col class=\"col-1\"><col class=\"col-2\"><col class=\"col-3\"><col class=\"col-4\"><col class=\"col-5\"><col class=\"col-6\"><col class=\"col-7\"></colgroup>";
  // Row 1: Photo + Nomor + Gender
  h+=btn+tr([rs11(foto),amber("実習生 NOMOR<br>番号"),center(nr),amber("性別&nbsp;&nbsp;&nbsp;JENIS KELAMIN"),center(gS)]);
  // Row 2: Nama + Usia
  h+=tr([amber("名前&nbsp;&nbsp;&nbsp;NAMA",2),amber("年齢&nbsp;&nbsp;&nbsp;USIA"),center(E(v("USIA","UMUR","identitas.umur").replace(/\D/g,""))+" 歳")]);
  // Row 3: Nama Lengkap + Tinggi
  h+=tr([td("<i>"+E(v("NAMALENGKAP","NAMA","identitas.nama_lengkap"))+"</i>","val-center uppercase",2),amber("身長&nbsp;&nbsp;&nbsp;TINGGI BADAN"),center(E(v("TB","TINGGI","fisik.tb").replace(/\D/g,""))+" CM")]);
  // Row 4: Furigana + Berat
  h+=tr([td("<i>"+E(v("FURIGANA","KATAKANA","NAMAKATAKANA","identitas.katakana"))+"</i>","val-center",2),amber("体重&nbsp;&nbsp;&nbsp;BERAT BADAN"),center(E(v("BB","BERAT","fisik.bb").replace(/\D/g,""))+" KG")]);
  // Row 5: Panggilan + Goldar
  h+=tr([amber("NAMA PANGGILAN<br>ニックネーム"),td("<i>"+E(v("NAMAPANGGILAN","PANGGILAN","PANGGILANID","identitas.panggilan"))+"<br>"+E(v("PANGGILANKATAKANA","KATAKANAPANGGILAN","PANGGILANJP","identitas.panggilan_katakana"))+"</i>","val-center leading-tight"),amber("血液型&nbsp;&nbsp;&nbsp;GOLONGAN DARAH"),center(E(gd)+" 型")]);
  // Row 6: Tgl Lahir + Status Nikah
  h+=tr([amber("生年月日&nbsp;&nbsp;&nbsp;TANGGAL LAHIR",2),amber("配偶者&nbsp;&nbsp;&nbsp;STATUS PERNIKAHAN"),center(nS)]);
  // Row 7: Tgl + Agama
  h+=tr([center("<i>"+E(tgl)+"</i>",2),amber("宗教&nbsp;&nbsp;&nbsp;AGAMA"),center(E(v("AGAMA","AGAMAID","AGAMAJP","identitas.agama")))]);
  // Row 8: Tempat Lahir + Pernah ke JP
  h+=tr([amber("出身地&nbsp;&nbsp;&nbsp;TEMPAT LAHIR",2),amber("来日経験&nbsp;&nbsp;&nbsp;PERNAH KE JEPANG"),center(jS)]);
  // Row 9: Tempat Lahir JP + Paspor
  h+=tr([td("<i>"+E(v("TEMPATLAHIR","TEMPATLAHIRID","identitas.tempat_lahir_id","identitas.tempat_lahir"))+"</i>","val-center uppercase",2),amber("パスポート番号<br>PERNAH MEMILIKI PASPOR"),center(pS)]);
  // Row 10: Tempat Lahir JP transliteration + Tangan
  h+=tr([td("<i>"+E(v("TEMPATLAHIRJP","identitas.tempat_lahir_jp")=="-"?"":v("TEMPATLAHIRJP","identitas.tempat_lahir_jp"))+"</i>","val-center",2),amber("利き手&nbsp;&nbsp;&nbsp;TANGAN AHLI"),center(tS)]);
  // Row 11: No HP + Riwayat Penyakit
  h+=tr([amber("携帯電話番号&nbsp;&nbsp;&nbsp;NO HP"),center("+"+E(wa.replace(/\D/g,""))),amber("病歴の有無&nbsp;RIWAYAT PENYAKIT<br>(KERAS, LUKA DLL)"),center(E(v("RIWAYATPENYAKIT","RIWAYATPENYAKITID","RIWAYATMEDISID","medis.riwayat_medis_id")=="-"?"TIDAK (無)":v("RIWAYATPENYAKIT","RIWAYATPENYAKITID","RIWAYATMEDISID","medis.riwayat_medis_id")))]);
  // Alamat
  h+=tr([td("通信欄 ALAMAT RUMAH","bg-amber val-center",7)]);
  h+=tr([td(E(v("ALAMATLENGKAP","ALAMAT","ALAMATID","identitas.alamat_id","identitas.alamat")),"val-center uppercase font-normal",7)]);
  h+=tr([td("<i>"+E(v("ALAMATJP","identitas.alamatjp","identitas.alamat_jp")=="-"?"":v("ALAMATJP","identitas.alamatjp","identitas.alamat_jp"))+"</i>","val-center font-normal",7)]);
  // Pendidikan
  h+=tr([td("学歴 PENDIDIKAN","bg-amber val-center",7)]);
  h+=tr([amber("期間 TAHUN",3),amber("学校名 NAMA SEKOLAH",2),amber("専攻 JURUSAN",2)]);
  h+=edu;
  // Pengalaman Kerja
  h+=tr([td("職歴 PENGALAMAN KERJA ","bg-amber val-center",7)]);
  h+=tr([amber("期間 TAHUN",3),amber("会社名 NAMA PERUSAHAAN",2),amber("職種 JENIS KERJA"),amber("月収/円 GAJI")]);
  h+=job;
  // Keluarga
  h+=tr([td("家族構成 SUSUNAN KELUARGA KANDUNG ","bg-amber val-center",7)]);
  h+=tr([amber("続柄 URUTAN KELUARGA",2),amber("名前 NAMA ANGGOTA KELUARGA",2),amber("年齢 USIA"),amber("職業 PEKERJAAN"),amber("月収/円 GAJI")]);
  h+=fam;
  h+=tr([td("個人情報 INFORMASI PERSONAL ","bg-amber val-center",7)]);
  h+=tr([amber("日本へ行く目的&nbsp;&nbsp;&nbsp;TUJUAN KE<br>JEPANG",3),td(E(v("wawancara.tujuan_ke_jepang_jp","TUJUANKEJEPANGJP","MOTIVASIKEJEPANGJP","MOTIVASIJP","wawancara.motivasi_jp"))+"<br>"+E(v("wawancara.tujuan_ke_jepang","TUJUANKEJEPANG","MOTIVASIKEJEPANG","MOTIVASIID","wawancara.motivasi_id")),"val-center font-normal",4)]);
  h+=tr([amber("帰国後の目標<br>SETELAH PULANG DARI JEPANG",3),td(E(v("wawancara.rencana_pulang_jp","RENCANAPULANGJP"))+"<br>"+E(v("wawancara.rencana_pulang_id","RENCANAPULANGID","RENCANASETELAHPULANG")),"val-center font-normal",4)]);
  h+=tr([amber("長所&nbsp;&nbsp;&nbsp;KELEBIHAN",3),td(E(v("KELEBIHANJP","wawancara.kelebihan_jp"))+"<br>"+E(v("KELEBIHAN","KELEBIHANID","wawancara.kelebihan_id")),"val-center font-normal",4)]);
  h+=tr([amber("短所&nbsp;&nbsp;&nbsp;KEKURANGAN",3),td(E(v("KEKURANGANJP","wawancara.kekurangan_jp"))+"<br>"+E(v("KEKURANGAN","KEKURANGANID","wawancara.kekurangan_id")),"val-center font-normal",4)]);
  h+=tr([amber("趣味&nbsp;&nbsp;&nbsp;HOBI",3),td(E(v("HOBIJP","wawancara.hobi_jp"))+"<br>"+E(v("HOBI","HOBIID","wawancara.hobi_id")),"val-center font-normal",4)]);
  h+=tr([td("資格・免許 SERTIFIKAT YANG DIMILIKI","bg-amber val-center",7)]);
  h+=tr([amber("日本語能力試験<br>JLPT/ SETARA",2),center(E(v("sertifikasi.bahasa_jepang","sertifikasi.nilai","JLPT","JFT","JFTTEXT","BAHASAJEPANG")=="-"?"TIDAK (無)":v("sertifikasi.bahasa_jepang","sertifikasi.nilai","JLPT","JFT","JFTTEXT","BAHASAJEPANG"))),amber("運転免許&nbsp;&nbsp;&nbsp;SURAT IZIN<br>MENGEMUDI (SIM A)"),center(E(v("identitas.sim","SIM")=="-"?"TIDAK (無)":v("identitas.sim","SIM"))),amber("他&nbsp;&nbsp;&nbsp;LAIN - LAIN"),center(E(v("sertifikasi.lisensi","SSW","SSWTEXT","LISENSI")=="-"?"-":v("sertifikasi.lisensi","SSW","SSWTEXT","LISENSI")))]);
  h+=tr([td("在日親戚・知人 KERABAT / KENALAN DI JEPANG","bg-amber val-center",7)]);
  h+=tr([amber("名前 NAMA",2),amber("関係 HUBUNGAN"),amber("職業 PEKERJAAN"),amber("年齢 USIA"),amber("日本の住所 ALAMAT DI JEPANG",2)]);
  h+=tr([td(E(v("kenalan_jepang.nama_jp","KENALANNAMAJP")=="-"?"無側":v("kenalan_jepang.nama_id","KENALANNAMAID","KENALANDIJEPANGNAMA")+"<br>"+v("kenalan_jepang.nama_jp","KENALANNAMAJP")),"val-center font-normal",2),td(E(v("kenalan_jepang.hubungan_jp","KENALANHUBJP")=="-"?v("kenalan_jepang.hubungan_id","KENALANHUBID","KENALANDIJEPANGHUBUNGAN"):v("kenalan_jepang.hubungan_id","KENALANHUBID","KENALANDIJEPANGHUBUNGAN")+"<br>"+v("kenalan_jepang.hubungan_jp","KENALANHUBJP")),"val-center font-normal"),td(E(v("kenalan_jepang.pekerjaan_jp","KENALANKERJAJP")=="-"?v("kenalan_jepang.pekerjaan_id","KENALANKERJAID","KENALANDIJEPANGPEKERJAAN"):v("kenalan_jepang.pekerjaan_id","KENALANKERJAID","KENALANDIJEPANGPEKERJAAN")+"<br>"+v("kenalan_jepang.pekerjaan_jp","KENALANKERJAJP")),"val-center font-normal"),td(E(v("kenalan_jepang.usia","KENALANUSIA","KENALANDIJEPANGUSIA")=="-"?"":v("kenalan_jepang.usia","KENALANUSIA","KENALANDIJEPANGUSIA")),"val-center font-normal"),td(E(v("kenalan_jepang.alamat_jp","KENALANALAMATJP")=="-"?v("kenalan_jepang.alamat_id","KENALANALAMATID","KENALANDIJEPANGALAMAT"):v("kenalan_jepang.alamat_id","KENALANALAMATID","KENALANDIJEPANGALAMAT")+"<br>"+v("kenalan_jepang.alamat_jp","KENALANALAMATJP")),"val-center font-normal",2)]);
  h+=tr([amber("付記&nbsp;&nbsp;&nbsp;CATATAN TAMBAHAN",3),td(E(v("CATATANTAMBAHAN","CATATAN")=="-"?"":v("CATATANTAMBAHAN","CATATAN")),"val-left font-normal",4)]);
  h+="</table>";
  return h;
}
export default function RirekishoBuilder({waTarget,isOpen,onClose,fotoFallback}:Props) {
  const u = useStore(authStore) as {isLoggedIn?:boolean;role?:string};
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [html,setHtml] = useState("");
  const isAdmin = u.role==="admin";

  useEffect(() => {
    if(!isOpen||!waTarget) return;
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const d = await apiClient.call<Record<string, any>>("getDrafCvMaster",[waTarget]);
        if(cancelled) return;
        if(!d||d.error) { setError(d?.error||t("ui.toast_master_incomplete")); return; }
        let ai={}; try{if(d.AIDATAJSON&&d.AIDATAJSON!=="-")ai=JSON.parse(d.AIDATAJSON);}catch{}
        const v = makeV(d,ai);
        const getArr = (key: string) => mergeArrRiwayat(getPath(d,key),getPath(ai,key),(keyOf as any)[key]);
        const edu=getArr("pendidikan"),job=getArr("pekerjaan"),fam=getArr("keluarga");
        let tglAsli=v("TGLLAHIR","TANGGALLAHIR","identitas.tgl_lahir");let tglFmt="-";
        if(tglAsli!=="-"){const dt=new Date(tglAsli);if(!isNaN(dt.getTime()))tglFmt=dt.getFullYear()+"年"+String(dt.getMonth()+1).padStart(2,"0")+"月"+String(dt.getDate()).padStart(2,"0")+"日";else tglFmt=tglAsli;}
        const photo = (d.uploads && d.uploads.photo) || fotoFallback || "";
        // S4 fix: Escape photo URL and validate scheme (https only).
        // NOTE: gunakan `esc` langsung. `E` hanyalah alias lokal di dalam
        // buildKertasA4() (baris ~116) dan TIDAK terlihat dari scope ini —
        // memanggil E() di sini melempar ReferenceError saat runtime dan
        // mematikan render CV begitu kandidat punya foto.
        const safePhoto = photo && /^https:\/\/[^\s"'<>]+$/.test(photo) ? esc(photo) : '';
        const foto = safePhoto ? "<img src=\""+safePhoto+"\" style=\"width:100%;height:100%;min-height:195px;object-fit:cover;object-position:top center;display:block;\">" : "<div style=\"width:100%;min-height:195px;display:flex;align-items:center;justify-content:center;font-size:10px;color:gray;\">FOTO</div>";
        const btn = isAdmin ? "<div class=\"flex flex-wrap items-center gap-2 mb-3 print:hidden z-50 relative\"><button onclick=\"window.print()\" class=\"px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg flex items-center font-sans text-sm transition-all hover:scale-105 border border-emerald-500\"><svg class=\"asj-icon mr-2\" width=\"1em\" height=\"1em\" fill=\"currentColor\" aria-hidden=\"true\" focusable=\"false\"><use href=\"#fas-print\"/></svg> Cetak Rirekisho</button><button onclick=\"window.print()\" class=\"px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg shadow-lg flex items-center font-sans text-sm transition-all hover:scale-105 border border-sky-500\"><svg class=\"asj-icon mr-2\" width=\"1em\" height=\"1em\" fill=\"currentColor\" aria-hidden=\"true\" focusable=\"false\"><use href=\"#fas-file-pdf\"/></svg> Simpan PDF</button></div>" : "<div class=\"text-center mb-3 print:hidden z-50 relative\"><span class=\"inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/80 text-slate-300 text-[10px] font-bold rounded-full border border-slate-500/50\"><svg class=\"asj-icon mr-1\" width=\"1em\" height=\"1em\" fill=\"currentColor\" aria-hidden=\"true\" focusable=\"false\"><use href=\"#fas-eye\"/></svg> MODE PREVIEW — Hanya bisa dicetak oleh Admin</span></div>";
        const id = buildCvIdentitas(v);
        const rendered = buildKertasA4({v,foto,btn,tgl:tglFmt,wa:waTarget,...id,edu:buildEduRows(edu,v),job:buildJobRows(job,v),fam:buildFamRows(fam,v)});
        if(!cancelled) setHtml(rendered);
      } catch { if(!cancelled) setError(t("ui.toast_server_conn_failed")); }
      finally { if(!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled=true; };
  },[isOpen,waTarget]);

  if(!isOpen) return null;
  return h("div",{id:"rirek-modal",class:"fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4 overflow-y-auto",onClick:(e)=>{if(e.target===e.currentTarget)onClose();}},
    h("div",{class:"bg-white rounded-xl shadow-2xl max-w-[210mm] w-full max-h-[95vh] overflow-y-auto p-6 relative"},
      h("button",{onClick:onClose,class:"absolute top-3 right-3 z-50 text-slate-500 hover:text-red-500 text-2xl print:hidden"},"×"),
      loading&&h("div",{class:"text-center py-20 text-slate-500"},t("ui.loading")),
      error&&h("div",{class:"text-center py-20 text-red-500"},error),
      !loading&&!error&&h("div",{class:"rirek-a4",dangerouslySetInnerHTML:{__html:html}}),
    ),
  );
}
