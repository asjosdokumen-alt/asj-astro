@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title ASJ Portal - netlify dev :8888

rem ===========================================================================
rem  ASJ Portal - server lokal  ->  http://localhost:8888
rem  Penjelasan lengkap: docs/lokal-server-8888.md
rem  Klik dua kali file ini. Tutup jendelanya untuk mematikan server.
rem ===========================================================================

rem -- 1. Shim NODE_OPTIONS ---------------------------------------------------
rem  WorkBuddy menyuntik --require safe-delete ke NODE_OPTIONS. Shim itu gagal
rem  menghapus .netlify/functions-serve, dan netlify dev mati dengan
rem  "Failed to load function ... trash operation". Dari terminal biasa variabel
rem  ini kosong, jadi baris ini tidak berpengaruh apa-apa di sana.
set "NODE_OPTIONS="

rem -- 1b. Proxy lingkungan ---------------------------------------------------
rem  WorkBuddy/agent mengekspor HTTP_PROXY yang menunjuk proxy lokal. netlify dev
rem  lalu memeriksa kesiapan framework lewat 127.0.0.1:4321 LEWAT PROXY itu,
rem  menerima 502, dan menunggu selamanya ("Waiting for framework port 4321")
rem  tanpa pernah membuka 8888. Dikosongkan di sini supaya localhost tidak pernah
rem  dirutekan lewat proxy. Dari terminal biasa variabel ini kosong, jadi baris
rem  ini tidak berpengaruh apa-apa di sana.
set "HTTP_PROXY="
set "HTTPS_PROXY="
set "http_proxy="
set "https_proxy="
set "NO_PROXY=localhost,127.0.0.1,::1"
set "no_proxy=localhost,127.0.0.1,::1"

rem -- 2. Port yang masih dipegang proses lama --------------------------------
rem  Kalau 4321 masih dipegang `astro dev` sisa sesi sebelumnya, netlify dev
rem  TIDAK error: ia mem-proxy 8888 ke server BASI itu, jadi yang terbuka kode
rem  lama sementara sumbernya sudah berubah. Bersihkan dulu, lalu mulai.
call :killport 4321
call :killport 8888

rem -- 3. Netlify CLI ---------------------------------------------------------
where netlify >nul 2>&1
if errorlevel 1 (
  echo.
  echo   [X] Netlify CLI tidak ditemukan di PATH.
  echo       Pasang sekali:  npm install -g netlify-cli
  echo       Lalu jalankan file ini lagi.
  echo.
  pause
  exit /b 1
)

echo.
echo   ASJ Portal siap di  http://localhost:8888
echo   Astro dev (sumber + hot reload) ada di baliknya, port 4321.
echo   Tutup jendela ini untuk mematikan server.
echo.

rem ===========================================================================
rem  4. Fungsi TERJADWAL dimatikan selama server lokal hidup
rem
rem  `sweep-queue` (tiap 2 menit) dan `agenda-reminders` (tiap 10 menit)
rem  MENYENTUH job_queue dan mengirim WhatsApp SUNGGUHAN. `.env.local` menunjuk
rem  database PRODUKSI, jadi membiarkannya hidup di sini berarti laptop ini
rem  mengerjakan antrean dan mengirim pengingat milik produksi.
rem
rem  Dulu ini dikerjakan dengan rename MANUAL, dan rename manual itulah yang
rem  berulang kali tertinggal sebagai utang: dua berkas hilang dari tree, dua
rem  suite jadi merah (`admission.test.ts`, `service-reminder-cron.test.ts`)
rem  hanya karena seseorang lupa menamainya kembali. Sekarang rename-nya
rem  dilakukan di sini, dan dikembalikan lagi di bawah — termasuk saat server
rem  dimatikan dengan Ctrl+C, karena `call` di bawah tetap kembali ke skrip ini.
rem
rem  `on` dulu: kalau run sebelumnya mati mendadak (jendela ditutup paksa),
rem  berkasnya tertinggal `.disabled` dan suite jadi merah. Baris ini
rem  memulihkannya sebelum menonaktifkannya lagi untuk run ini.
rem ===========================================================================
call :sched on
call :sched off

rem  --offline WAJIB di mesin ini: tanpa itu netlify dev memanggil API Netlify
rem  untuk daftar add-on situs, dan token CLI yang terpasang milik akun lain
rem  ("Failed retrieving addons for site ...: Not Found"). --offline memakai
rem  .env / .env.local saja, yang justru sudah lengkap.
call netlify dev --offline --port 8888

call :sched on

echo.
echo   Server berhenti (exit %errorlevel%).
pause
exit /b %errorlevel%

rem ===========================================================================
:sched
rem  %1 = off (rename .ts -> .ts.disabled) | on (kembalikan)
for %%F in (sweep-queue agenda-reminders) do (
  if /i "%~1"=="off" (
    if exist "netlify\functions\%%F.ts" ren "netlify\functions\%%F.ts" "%%F.ts.disabled"
  ) else (
    if exist "netlify\functions\%%F.ts.disabled" ren "netlify\functions\%%F.ts.disabled" "%%F.ts"
  )
)
exit /b 0


rem ===========================================================================
:killport
rem  %1 = nomor port. Hanya mematikan baris LISTENING pada port itu.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:"LISTENING" ^| findstr /c:":%~1 "') do (
  echo   [bersih] port %~1 masih dipakai PID %%P - dimatikan
  taskkill /F /PID %%P >nul 2>&1
)
exit /b 0
