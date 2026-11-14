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
3. Pada **Draf BAB I–V**, pilih bab, isi target halaman dan kata, lalu klik **Generate**. Gunakan **Lanjutkan draf** untuk menambah isi atau **Regenerate** untuk mengganti draf dengan konfirmasi. Estimasi halaman memakai 250 kata per halaman. Tata letak Word menentukan jumlah halaman cetak yang sebenarnya.
4. Klik **Simpan**. Proyek yang tersimpan tersedia dari perangkat lain pada akun yang sama.
5. Pada **Draf BAB I–V**, pilih bab dan klik **Unduh Word BAB …** untuk membuat DOCX berisi bab tersebut. **Ekspor Word lengkap** menggabungkan halaman awal, bab, daftar pustaka, dan lampiran yang sudah diisi.
6. Pada **Kelengkapan Naskah**, pilih bagian yang ingin diisi atau diunduh. Templat halaman awal dapat disesuaikan dengan pedoman sekolah atau kampus. Skor, statistik deskriptif, dan hasil analisis bisa disalin dari **Analisis kuantitatif**. Isi rekap validitas dari hasil pengujian yang sudah dilakukan.
7. Dalam naskah lengkap, gunakan **Perbarui Bidang** di Word untuk mengisi nomor halaman daftar isi dan daftar lampiran. Isi daftar gambar dan tabel secara manual. Unduhan daftar secara terpisah memuat judul tanpa nomor halaman naskah lengkap.

Data proyek disimpan di database AppDeploy dengan ruang data terpisah untuk setiap akun. Simpan memeriksa versi proyek sebelum menulis. Jika proyek telah diperbarui dari perangkat lain, salin perubahan yang perlu dipertahankan sebelum membuka proyek kembali.

Di **Referensi**, pilih jenis buku, jurnal, artikel, atau website untuk sumber manual. Crossref menyediakan filter buku dan artikel jurnal. Pencarian web dibuka lewat tautan Google.

Di **Analisis kuantitatif**, tempel skor angka dari Excel sebagai TSV, CSV sederhana, atau data dipisahkan titik koma. Gunakan statistik deskriptif, korelasi Pearson, uji t berpasangan, atau reliabilitas Cronbach. Hasil yang dihitung maupun laporan yang sudah tersedia dapat ditambahkan ke BAB IV.

**Bahasa keluaran penelitian** diatur per proyek. Pilih salah satu bahasa dalam daftar atau masukkan nama/kode pada **Bahasa lain**. Pengaturan berlaku untuk generasi judul usulan, pertanyaan, bab, dan instrumen. Gunakan **Regenerate** untuk membuat ulang draf bab dalam pilihan baru. Word memakai judul bagian bawaan untuk bahasa dalam daftar dan menerima judul bagian khusus untuk bahasa lain. Bahasa dokumen tidak mengubah judul referensi dan angka penelitian.

BAB IV dimulai dengan `[MASUKKAN DATA PENELITIAN]`. Ganti penanda setelah data tersedia. Pada instrumen, tabel Markdown dengan baris pemisah menjadi tabel Word. Instrumen teks biasa diekspor sebagai tabel dua kolom.

## Pengujian

`npm test` menjalankan pengujian penyimpanan menggunakan adapter database pengujian, kegagalan Ollama yang disimulasikan, dan struktur DOCX. File `tests/tests.json` berisi skenario QA AppDeploy. Login produksi dan koneksi Ollama memerlukan akun dan secret yang aktif.

Versi lama menyimpan draf di browser asal. Untuk memindahkan draf tersebut, salin dari versi lama ke proyek akun baru. Unduhan Word tersedia tanpa panggilan ke Ollama.
