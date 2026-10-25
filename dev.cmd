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

rem  --offline WAJIB di mesin ini: tanpa itu netlify dev memanggil API Netlify
rem  untuk daftar add-on situs, dan token CLI yang terpasang milik akun lain
rem  ("Failed retrieving addons for site ...: Not Found"). --offline memakai
rem  .env / .env.local saja, yang justru sudah lengkap.
call netlify dev --offline --port 8888

echo.
echo   Server berhenti (exit %errorlevel%).
pause
exit /b %errorlevel%

rem ===========================================================================
:killport
rem  %1 = nomor port. Hanya mematikan baris LISTENING pada port itu.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:"LISTENING" ^| findstr /c:":%~1 "') do (
  echo   [bersih] port %~1 masih dipakai PID %%P - dimatikan
  taskkill /F /PID %%P >nul 2>&1
)
exit /b 0
