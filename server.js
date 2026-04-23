const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const ExcelJS = require('exceljs'); // Library untuk Export Pro
const path = require('path');
const fs = require('fs');
require('dotenv').config(); 

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Limit diperbesar untuk menerima gambar diagram

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: 'uploads/' });

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'perpustakaan_db', 
    waitForConnections: true,
    connectionLimit: 10
});

// 1. Get Stats
app.get('/api/stats', (req, res) => {
    const q1 = "SELECT COUNT(*) as totalJudul FROM buku";
    const q2 = "SELECT SUM(stok) as totalStok FROM buku";
    const q3 = "SELECT COUNT(*) as totalPinjam FROM peminjaman WHERE status = 'Dipinjam'";
    db.query(q1, (err1, r1) => {
        db.query(q2, (err2, r2) => {
            db.query(q3, (err3, r3) => {
                res.json({
                    totalJudul: r1[0]?.totalJudul || 0,
                    totalStok: r2[0]?.totalStok || 0,
                    totalPinjam: r3[0]?.totalPinjam || 0
                });
            });
        });
    });
});

// 2. Get Books (Diperbarui dengan Pagination)
app.get('/api/books', (req, res) => {
    const s = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // Menampilkan 20 buku per halaman
    const offset = (page - 1) * limit;

    const searchPattern = `%${s}%`;
    
    // Pertama, hitung total data untuk mengetahui jumlah halaman
    db.query("SELECT COUNT(*) as total FROM buku WHERE judul LIKE ? OR penulis LIKE ?", [searchPattern, searchPattern], (err, countResult) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // Kedua, ambil data buku sesuai halaman yang sedang dibuka
        db.query("SELECT * FROM buku WHERE judul LIKE ? OR penulis LIKE ? LIMIT ? OFFSET ?", 
        [searchPattern, searchPattern, limit, offset], (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            
            res.json({
                data: results,
                currentPage: page,
                totalPages: totalPages,
                totalItems: totalItems
            });
        });
    });
});

// 3. Import Excel (Diperbarui: Menyimpan nama asal file)
app.post('/api/import', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "File kosong" });
    try {
        const originalName = req.file.originalname; // Ambil nama asli file Excel
        const workbook = xlsx.readFile(req.file.path);
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
        fs.unlinkSync(req.file.path);
        
        const rows = data.slice(1);
        // Tambahkan originalName di akhir array values
        const values = rows.filter(r => r[0]).map(r => [r[0], r[1] || 'Anonim', r[2] || 0, r[3] || 'Umum', originalName]);
        
        // Update query INSERT untuk memasukkan asal_file
        db.query("INSERT INTO buku (judul, penulis, stok, kategori, asal_file) VALUES ?", [values], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: `${result.affectedRows} buku berhasil diimport` });
        });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// 4. Pinjam Buku
app.post('/api/pinjam', (req, res) => {
    const { buku_id, nama, kelas, kategori } = req.body;
    const q1 = "INSERT INTO peminjaman (buku_id, nama_peminjam, kelas_peminjam, kategori_pinjam, tgl_pinjam, status, denda) VALUES (?, ?, ?, ?, NOW(), 'Dipinjam', 0)";
    const q2 = "UPDATE buku SET stok = stok - 1 WHERE id = ?";
    db.query(q1, [buku_id, nama, kelas, kategori], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query(q2, [buku_id], () => res.json({ message: "Berhasil Pinjam" }));
    });
});

// 5. Kembali Buku
app.post('/api/kembali', (req, res) => {
    const { id, buku_id } = req.body;
    db.query("SELECT tgl_pinjam FROM peminjaman WHERE id = ?", [id], (err, result) => {
        if (err || result.length === 0) return res.status(500).json({ message: "Data tidak ditemukan" });

        const tglPinjam = new Date(result[0].tgl_pinjam);
        const tglSekarang = new Date();
        const selisihWaktu = tglSekarang.getTime() - tglPinjam.getTime();
        
        // --- LOGIKA TESTING (MENIT) ---
        // Konversi selisih waktu ke menit
        const selisihMenit = Math.floor(selisihWaktu / (1000 * 60));
        
        let denda = 0;
        // Jika lebih dari 60 menit (1 jam), kalikan keterlambatan dengan 2500
        if (selisihMenit > 60) denda = (selisihMenit - 60) * 2500;

        const qUpdatePinjam = "UPDATE peminjaman SET status = 'Dikembalikan', denda = ? WHERE id = ?";
        const qUpdateBuku = "UPDATE buku SET stok = stok + 1 WHERE id = ?";

        db.query(qUpdatePinjam, [denda, id], (err) => {
            db.query(qUpdateBuku, [buku_id], () => {
                const telat = selisihMenit > 60 ? selisihMenit - 60 : 0;
                res.json({ message: `Kembali sukses! Keterlambatan: ${telat} menit. Denda: Rp ${denda}` });
            });
        });
    });
});

// 6. Get Reports
app.get('/api/reports', (req, res) => {
    const query = `
        SELECT p.*, b.judul, b.kategori 
        FROM peminjaman p 
        LEFT JOIN buku b ON p.buku_id = b.id 
        ORDER BY p.id DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const reports = results.map(row => {
            if (row.status === 'Dipinjam') {
                const tglPinjam = new Date(row.tgl_pinjam);
                const sekarang = new Date();
                const selisihWaktu = sekarang.getTime() - tglPinjam.getTime();
                
                // --- LOGIKA TESTING (MENIT) ---
                const selisihMenit = Math.floor(selisihWaktu / (1000 * 60));
                row.denda = selisihMenit > 60 ? (selisihMenit - 60) * 2500 : 0;
            }
            return row;
        });
        const totalDenda = reports.reduce((a, b) => a + (Number(b.denda) || 0), 0);
        res.json({ reports, totalDenda });
    });
});

// 7. Tambah Buku Manual
app.post('/api/books', (req, res) => {
    const { judul, penulis, stok, kategori } = req.body;
    db.query("INSERT INTO buku (judul, penulis, stok, kategori) VALUES (?, ?, ?, ?)", 
    [judul, penulis, stok, kategori || 'Umum'], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Buku berhasil ditambahkan" });
    });
});

// 8. Hapus Buku 
app.delete('/api/books/:id', (req, res) => {
    const { id } = req.params;
    db.query("DELETE FROM peminjaman WHERE buku_id = ?", [id], () => {
        db.query("DELETE FROM buku WHERE id = ?", [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Buku berhasil dihapus" });
        });
    });
});

// 9. Export Excel Profesional 
app.post('/api/export', async (req, res) => {
    try {
        const { data, chartImage, stats } = req.body;
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Admin Perpus';

        // --- SHEET 1: RINGKASAN & GRAFIK ---
        const sheetSummary = workbook.addWorksheet('Ringkasan Laporan');
        sheetSummary.getColumn('B').width = 30;
        sheetSummary.getColumn('C').width = 25;

        // Judul Ringkasan
        sheetSummary.mergeCells('B2:C2');
        sheetSummary.getCell('B2').value = 'RINGKASAN STATISTIK PERPUSTAKAAN';
        sheetSummary.getCell('B2').font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        sheetSummary.getCell('B2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        sheetSummary.getCell('B2').alignment = { horizontal: 'center', vertical: 'middle' };

        // Data Ringkasan
        sheetSummary.getCell('B4').value = 'Total Buku Sedang Dipinjam';
        sheetSummary.getCell('C4').value = stats.totalDipinjam;
        sheetSummary.getCell('B5').value = 'Total Buku Dikembalikan';
        sheetSummary.getCell('C5').value = stats.totalKembali;
        sheetSummary.getCell('B6').value = 'Total Akumulasi Denda';
        sheetSummary.getCell('C6').value = stats.totalDenda;

        // Styling Tabel Ringkasan
        ['B4','B5','B6'].forEach(cell => sheetSummary.getCell(cell).font = { bold: true });
        ['B4','C4','B5','C5','B6','C6'].forEach(cell => {
            sheetSummary.getCell(cell).border = {
                top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'}
            };
        });

        // Menyisipkan Gambar Diagram Lingkaran
        if (chartImage) {
            const base64Data = chartImage.replace(/^data:image\/png;base64,/, "");
            const imageId = workbook.addImage({ base64: base64Data, extension: 'png' });
            // Letakkan diagram di sebelah kanan ringkasan
            sheetSummary.addImage(imageId, {
                tl: { col: 4, row: 1 }, 
                ext: { width: 400, height: 400 } 
            });
        }

        // --- SHEET 2: DATA TABEL ---
        const sheetData = workbook.addWorksheet('Data Peminjaman');
        sheetData.columns = [
            { header: 'Peminjam', key: 'peminjam', width: 25 },
            { header: 'Kelas', key: 'kelas', width: 12 },
            { header: 'Judul Buku', key: 'buku', width: 35 },
            { header: 'Kategori', key: 'kategori', width: 20 },
            { header: 'Tgl Pinjam', key: 'tgl_pinjam', width: 18 },
            { header: 'Status', key: 'status', width: 18 },
            { header: 'Denda', key: 'denda', width: 15 },
            { header: 'Aksi', key: 'aksi', width: 22 }
        ];

        // Styling Header Tabel Data
        sheetData.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheetData.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        sheetData.getRow(1).alignment = { horizontal: 'center' };

        // Isi Data dan Warnai Teks Aksi
        data.forEach((item) => {
            const row = sheetData.addRow(item);
            
            // Kolom Aksi ada di index ke-8
            const cellAksi = row.getCell(8);
            if (item.aksi === 'Belum dikembalikan') {
                cellAksi.font = { color: { argb: 'FFEF4444' }, bold: true }; // Merah
            } else if (item.aksi === 'Sudah dikembalikan') {
                cellAksi.font = { color: { argb: 'FF10B981' }, bold: true }; // Hijau
            }
        });

        // Kirim File ke Frontend
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Laporan_Perpustakaan_Pro.xlsx"');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Gagal membuat laporan excel" });
    }
});

// 10. Dapatkan Riwayat File Import (FITUR BARU)
app.get('/api/import-history', (req, res) => {
    db.query("SELECT DISTINCT asal_file FROM buku WHERE asal_file IS NOT NULL", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        const files = results.map(r => r.asal_file);
        res.json(files);
    });
});

// 11. Hapus Buku Berdasarkan File Import (FITUR BARU)
app.delete('/api/books/import/:filename', (req, res) => {
    const filename = req.params.filename;
    
    // Hapus riwayat peminjaman terkait buku-buku dari file ini terlebih dahulu (mencegah error Foreign Key)
    db.query("DELETE p FROM peminjaman p JOIN buku b ON p.buku_id = b.id WHERE b.asal_file = ?", [filename], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Setelah peminjaman aman, hapus buku-bukunya
        db.query("DELETE FROM buku WHERE asal_file = ?", [filename], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: `Semua data dari file ${filename} berhasil dihapus` });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));