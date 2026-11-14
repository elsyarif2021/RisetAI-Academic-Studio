# RisetAI Academic Studio

Ruang kerja penelitian berbahasa Indonesia dengan login AppDeploy. Pengguna dapat membuat proyek, mengelola referensi, menyunting BAB I–V dan instrumen, lalu mengunduh dokumen Word.

## Menjalankan di AppDeploy

- Pilih React + Vite, dengan frontend dan backend.
- Pakai `backend/index.ts` sebagai entry point. AppDeploy menyediakan `@appdeploy/client` dan `@appdeploy/sdk` saat build.
- Tambahkan `OLLAMA_API_KEY` melalui formulir secret AppDeploy. Buka **Model & layanan**, lalu klik **Tes koneksi Ollama** untuk memeriksa respons model.
- Pencarian Crossref tersedia tanpa API key. Tautan Google Scholar membuka hasil di tab baru. Untuk pencarian Google atau Scholar langsung di aplikasi, pasang `GOOGLE_API_KEY` dan `GOOGLE_CSE_ID` atau `SERPAPI_KEY`. Referensi yang ditambahkan manual tersedia tanpa konfigurasi eksternal.

## Menggunakan proyek

1. Masuk dan klik **Proyek baru**. Isi judul dan pertanyaan penelitian.
2. Tambahkan referensi manual, atau periksa sumber eksternal dan tandai **Sudah saya periksa**.
3. Tulis bab dan instrumen secara manual atau gunakan bantuan Ollama Cloud. Halaman yang ditargetkan adalah perkiraan untuk prompt AI.
4. Klik **Simpan**. Proyek yang tersimpan tersedia dari perangkat lain pada akun yang sama.
5. Pada **Draf BAB I–V** pilih **Ekspor Word**. Untuk unduhan instrumen terpisah, pilih **Ekspor instrumen Word**.

Data proyek disimpan di database AppDeploy dengan ruang data terpisah untuk setiap akun. Simpan memeriksa versi proyek sebelum menulis. Jika proyek telah diperbarui dari perangkat lain, salin perubahan yang perlu dipertahankan sebelum membuka proyek kembali.

BAB IV dimulai dengan `[MASUKKAN DATA PENELITIAN]`. Ganti penanda setelah data tersedia. Pada instrumen, tabel Markdown dengan baris pemisah menjadi tabel Word. Instrumen teks biasa diekspor sebagai tabel dua kolom.

## Pengujian

`npm test` menjalankan pengujian penyimpanan menggunakan adapter database pengujian, kegagalan Ollama yang disimulasikan, dan struktur DOCX. File `tests/tests.json` berisi skenario QA AppDeploy. Login produksi dan koneksi Ollama memerlukan akun dan secret yang aktif.

Versi lama menyimpan draf di browser asal. Untuk memindahkan draf tersebut, salin dari versi lama ke proyek akun baru. Unduhan Word tersedia tanpa panggilan ke Ollama.
