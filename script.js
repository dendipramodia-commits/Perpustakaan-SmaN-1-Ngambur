const API = 'https://perpustakaan-sman-1-ngambur-production.up.railway.app/api';
let myChart = null;
let currentReportsData = []; 
let currentPage = 1; 

// --- KONFIGURASI NOTIFIKASI MELAYANG (TOAST) ---
const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer)
        toast.addEventListener('mouseleave', Swal.resumeTimer)
    }
});
// ----------------------------------------------

function nav(id, el) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (el) el.classList.add('active');
    
    if(id === 'p-dash') loadStats();
    if(id === 'p-books') loadBooks(1); 
    if(id === 'p-lap') loadReports();
}

async function loadStats() {
    try {
        const r = await fetch(`${API}/stats`);
        const d = await r.json();
        document.getElementById('s1').innerText = d.totalJudul || 0;
        document.getElementById('s2').innerText = d.totalStok || 0;
        document.getElementById('s3').innerText = d.totalPinjam || 0;
        
        renderChart(d.totalPinjam || 0, d.totalStok || 0);
    } catch (e) {
        console.error("Gagal memuat statistik", e);
    }
}

async function renderChart(pinjam, stok) {
    try {
        const canvas = document.getElementById('loanChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if(myChart) myChart.destroy(); 
        
        myChart = new Chart(ctx, {
            type: 'doughnut', 
            data: { 
                labels: ['Sedang Dipinjam', 'Stok Buku'], 
                datasets: [{ 
                    data: [pinjam, stok], 
                    backgroundColor: ['#f59e0b', '#10b981'], 
                    borderWidth: 0,
                    hoverOffset: 10
                }] 
            },
            options: { 
                maintainAspectRatio: false, 
                cutout: '70%', 
                animation: false, 
                plugins: { legend: { position: 'bottom' } } 
            }
        });
    } catch (e) {
        console.error("Gagal merender grafik", e);
    }
}

async function loadBooks(page = 1) {
    try {
        currentPage = page;
        const s = document.getElementById('bSearch')?.value || '';
        
        document.getElementById('book-grid').innerHTML = `
            <div style="text-align:center; width:100%; grid-column: 1 / -1; padding: 40px;">
                <i class="fas fa-circle-notch fa-spin" style="font-size: 32px; color: #4f46e5; margin-bottom: 15px;"></i>
                <p style="color:#64748b; font-weight: 500;">Sedang mengambil data...</p>
            </div>
        `;
        
        const r = await fetch(`${API}/books?q=${s}&page=${page}&limit=20`);
        const res = await r.json();
        const books = res.data;

        if (!books || books.length === 0) {
            document.getElementById('book-grid').innerHTML = '<p style="text-align:center; width:100%; grid-column: 1 / -1; color:#64748b;">Buku tidak ditemukan.</p>';
            renderPagination(1, 1);
            return;
        }

        document.getElementById('book-grid').innerHTML = books.map(b => `
            <div class="book-card" style="background: white; padding: 20px; border-radius: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <div class="badge ${b.stok > 0 ? 'bg-green' : 'bg-red'}" style="margin-bottom: 10px; display: inline-block;">${b.stok > 0 ? 'Tersedia' : 'Habis'}</div>
                    <h3 style="margin: 0 0 5px 0; color: #1e293b;">${b.judul}</h3>
                    <p style="margin: 0; color: #475569;"><i class="fas fa-pen-fancy"></i> ${b.penulis}</p>
                    <p style="font-size: 13px; color: #64748b; margin-top: 8px;"><i class="fas fa-tags"></i> ${b.kategori || 'Umum'}</p>
                </div>
                
                <div class="book-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 15px;">
                    <span style="font-size: 15px; color: #475569;">Stok: <b style="color: #1e293b;">${b.stok}</b></span>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="hapusBuku(${b.id})" style="background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 8px; cursor: pointer; transition: 0.2s;" title="Hapus Buku">
                            <i class="fas fa-trash"></i>
                        </button>
                        
                        <button onclick="pinjamBuku(${b.id}, '${b.judul.replace(/'/g, "\\'")}', '${b.kategori || 'Umum'}')" style="background: ${b.stok <= 0 ? '#cbd5e1' : '#4f46e5'}; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: ${b.stok <= 0 ? 'not-allowed' : 'pointer'}; font-weight: bold; transition: 0.2s;" ${b.stok <= 0 ? 'disabled' : ''}>
                            Pinjam
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        renderPagination(res.currentPage, res.totalPages);
    } catch (e) {
        console.error("Gagal meload buku", e);
    }
}

function renderPagination(current, total) {
    let pagContainer = document.getElementById('pagination-container');
    
    if (!pagContainer) {
        pagContainer = document.createElement('div');
        pagContainer.id = 'pagination-container';
        pagContainer.style = "display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 30px; margin-bottom: 20px; width: 100%; grid-column: 1 / -1;";
        document.getElementById('book-grid').parentNode.insertBefore(pagContainer, document.getElementById('book-grid').nextSibling);
    }

    let html = '';
    html += `<button onclick="loadBooks(${current - 1})" ${current === 1 ? 'disabled' : ''} style="padding: 8px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: ${current === 1 ? '#f8fafc' : 'white'}; cursor: ${current === 1 ? 'not-allowed' : 'pointer'}; color: ${current === 1 ? '#94a3b8' : '#1e293b'}; font-weight: 500;"><i class="fas fa-chevron-left"></i></button>`;
    html += `<span style="padding: 8px 16px; background: #eef2ff; color: #4f46e5; border-radius: 8px; font-weight: bold; font-size: 14px;">Hal. ${current} / ${total}</span>`;
    html += `<button onclick="loadBooks(${current + 1})" ${current === total || total === 0 ? 'disabled' : ''} style="padding: 8px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: ${current === total || total === 0 ? '#f8fafc' : 'white'}; cursor: ${current === total || total === 0 ? 'not-allowed' : 'pointer'}; color: ${current === total || total === 0 ? '#94a3b8' : '#1e293b'}; font-weight: 500;"><i class="fas fa-chevron-right"></i></button>`;

    pagContainer.innerHTML = html;
}

async function hapusBuku(id) {
    const konfirmasi = await Swal.fire({
        title: 'Hapus Buku?',
        text: "Buku ini akan dihapus permanen!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Ya, Hapus!'
    });

    if (konfirmasi.isConfirmed) {
        Swal.fire({ title: 'Menghapus...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            const res = await fetch(`${API}/books/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Gagal menghapus buku");
            
            Toast.fire({ icon: 'success', title: 'Buku berhasil dihapus' });
            loadBooks(currentPage); loadStats();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }
}

async function pinjamBuku(id, judul, kategoriBuku) {
    const { value: formValues } = await Swal.fire({
        title: 'Data Peminjam',
        html:
            '<div style="display: flex; justify-content: space-between; gap: 10px; margin-bottom: 10px;">' +
                '<input id="swal-nama" class="swal2-input" style="margin: 0; width: 65%; font-size: 15px;" placeholder="Nama Lengkap">' +
                '<select id="swal-kelas" class="swal2-select" style="margin: 0; width: 35%; padding: 0 10px; font-size: 14px;">' +
                    '<option value="X">Kelas X</option>' +
                    '<option value="XI">Kelas XI</option>' +
                    '<option value="XII">Kelas XII</option>' +
                    '<option value="Guru/Staf">Guru/Staf</option>' +
                '</select>' +
            '</div>' +
            '<p style="font-size: 13px; color: #64748b; margin: 15px 0 0 0; text-align: left; background: #f8fafc; padding: 10px; border-radius: 8px;">' +
                'Meminjam: <b>' + judul + '</b> <br>Kategori: <b>' + kategoriBuku + '</b>' +
            '</p>',
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Pinjam',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#4f46e5',
        preConfirm: () => {
            const nama = document.getElementById('swal-nama').value;
            const kelas = document.getElementById('swal-kelas').value;
            const kategori = kategoriBuku; 

            if (!nama) {
                Swal.showValidationMessage('Nama peminjam wajib diisi!');
                return false;
            }
            return { nama, kelas, kategori };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Memproses...', text: 'Mohon tunggu sebentar', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        try {
            const res = await fetch(`${API}/pinjam`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ 
                    buku_id: id, 
                    nama: formValues.nama, 
                    kelas: formValues.kelas,
                    kategori: formValues.kategori
                }) 
            });
            
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.message || errData.error || 'Server gagal memproses peminjaman');
            }
            
            Toast.fire({ icon: 'success', title: 'Buku berhasil dipinjam' });
            loadBooks(currentPage); loadStats(); loadReports();
        } catch (e) {
            Swal.fire('Error Database/Server', e.message, 'error');
        }
    }
}

async function kembaliBuku(id, b_id) {
    Swal.fire({ title: 'Memproses...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const res = await fetch(`${API}/kembali`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ id, buku_id: b_id }) 
        });
        
        const data = await res.json().catch(() => ({}));
        
        if (!res.ok) throw new Error(data.message || data.error || 'Gagal mengembalikan buku');
        
        Toast.fire({ icon: 'success', title: 'Buku telah dikembalikan' });
        loadReports(); loadStats(); loadBooks(currentPage);
    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    }
}

async function addBook() {
    const body = { 
        judul: document.getElementById('in-j').value, 
        penulis: document.getElementById('in-p').value, 
        stok: document.getElementById('in-s').value,
        kategori: document.getElementById('in-kategori').value 
    };
    
    if(!body.judul) return Swal.fire('Oops', 'Judul buku wajib diisi', 'warning');
    if(!body.kategori) return Swal.fire('Oops', 'Silakan pilih kategori buku terlebih dahulu', 'warning');
    
    Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const res = await fetch(`${API}/books`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify(body) 
        });
        
        if(res.ok) {
            Toast.fire({ icon: 'success', title: 'Buku berhasil disimpan' });
            document.getElementById('in-j').value = ''; 
            document.getElementById('in-p').value = ''; 
            document.getElementById('in-s').value = '';
            document.getElementById('in-kategori').value = ''; 
            loadStats(); loadBooks(1);
        } else {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || 'Gagal menyimpan buku');
        }
    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    }
}

async function loadReports() {
    try {
        const r = await fetch(`${API}/reports`);
        const d = await r.json();
        
        const fBulan = document.getElementById('fBulan')?.value;
        const fTahun = document.getElementById('fTahun')?.value;
        
        let filteredData = d.reports || [];
        
        if (fBulan && fBulan !== 'all') {
            filteredData = filteredData.filter(i => new Date(i.tgl_pinjam).getMonth() + 1 == fBulan);
        }
        if (fTahun && fTahun !== 'all') {
            filteredData = filteredData.filter(i => new Date(i.tgl_pinjam).getFullYear() == fTahun);
        }

        currentReportsData = filteredData;

        document.getElementById('report-table').innerHTML = filteredData.map(i => {
            // LOGIKA TANGGAL KEMBALI YANG DIPERBAIKI
            let tglKembaliTeks = '-';
            
            if (i.status !== 'Dipinjam') {
                // Mencari field tanggal dari database (men-support berbagai format field)
                const tgl = i.tgl_kembali || i.tanggal_kembali || i.updated_at || i.updatedAt;
                
                // Jika server mengirimkan data tanggal, tampilkan tanggalnya. Jika benar-benar kosong tampilkan "-"
                tglKembaliTeks = tgl ? new Date(tgl).toLocaleDateString('id-ID') : '-';
            }

            return `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px;"><b>${i.nama_peminjam}</b></td>
                <td style="padding: 12px;"><span style="background: #eef2ff; color: #4f46e5; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: bold;">${i.kelas_peminjam || '-'}</span></td>
                <td style="padding: 12px;">${i.judul}</td>
                <td style="padding: 12px;">${i.kategori_pinjam || i.kategori || 'Umum'}</td>
                <td style="padding: 12px;">${new Date(i.tgl_pinjam).toLocaleDateString('id-ID')}</td>
                
                <td style="padding: 12px; font-weight: 500; color: ${tglKembaliTeks === '-' ? '#94a3b8' : '#1e293b'}; text-align: center;">
                    ${tglKembaliTeks}
                </td>
                
                <td style="padding: 12px;"><span class="status-pill ${i.status.toLowerCase()}">${i.status}</span></td>
                <td style="padding: 12px; color: ${i.denda > 0 ? '#ef4444' : '#64748b'}; font-weight: bold;">Rp ${Number(i.denda).toLocaleString('id-ID')}</td>
                <td style="padding: 12px;">
                    ${i.status === 'Dipinjam' 
                        ? `<button style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; width: 75px;" onclick="kembaliBuku(${i.id}, ${i.buku_id})">Selesai</button>` 
                        : '<div style="width: 75px; text-align: center;"><i class="fas fa-check-circle" style="color: #10b981; font-size: 20px;"></i></div>'}
                </td>
                <td style="padding: 12px;">
                    <button style="background: #4f46e5; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 500; width: 85px;" 
                            onclick="cetakStruk('${i.nama_peminjam}', '${i.kelas_peminjam || '-'}', '${i.judul.replace(/'/g, "\\'")}', '${i.tgl_pinjam}', ${i.denda || 0}, '${i.status}')" title="Cetak Struk Transaksi">
                        <i class="fas fa-print"></i> Cetak
                    </button>
                </td>
            </tr>
            `;
        }).join('');
        
        const dendaFilter = filteredData.reduce((acc, curr) => acc + (Number(curr.denda) || 0), 0);
        document.getElementById('total-denda-text').innerText = `Rp ${dendaFilter.toLocaleString('id-ID')}`;
    } catch (e) {
        console.error("Gagal meload reports", e);
    }
}

function importExcel(input) {
    const file = input.files[0];
    if(!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    Swal.fire({ title: 'Memproses Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    fetch(`${API}/import`, { method: 'POST', body: formData })
    .then(async r => {
        const res = await r.json();
        if(!r.ok) throw new Error(res.error || 'Gagal import Excel');
        return res;
    })
    .then(res => {
        Toast.fire({ icon: 'success', title: res.message });
        loadStats(); loadBooks(1);
        input.value = ''; 
    })
    .catch(err => Swal.fire('Error Import', err.message, 'error'));
}

async function hapusBukuImport() {
    try {
        const res = await fetch(`${API}/import-history`);
        const files = await res.json();

        if (!files || files.length === 0) {
            return Swal.fire('Data Kosong', 'Belum ada riwayat buku dari hasil import Excel.', 'info');
        }

        let inputOptions = {};
        files.forEach(f => inputOptions[f] = f);

        const { value: selectedFile } = await Swal.fire({
            title: 'Hapus Data Import',
            text: 'Pilih nama file Excel. Semua buku dari file ini akan dihapus!',
            input: 'select',
            inputOptions: inputOptions,
            inputPlaceholder: '-- Pilih File Excel --',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Lanjut Hapus'
        });

        if (selectedFile) {
            const konfirmasi = await Swal.fire({
                title: 'Konfirmasi Terakhir',
                html: `Yakin ingin menghapus <b>SEMUA BUKU</b> dari file <br><span style="color:#ef4444;">${selectedFile}</span>?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                confirmButtonText: 'Ya, Hapus Semua!'
            });

            if (konfirmasi.isConfirmed) {
                Swal.fire({ title: 'Menghapus data...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                
                const delRes = await fetch(`${API}/books/import/${encodeURIComponent(selectedFile)}`, { method: 'DELETE' });
                const delData = await delRes.json();
                
                if (delRes.ok) {
                    Toast.fire({ icon: 'success', title: delData.message });
                    loadBooks(1); loadStats();
                } else {
                    throw new Error(delData.error || "Gagal menghapus data");
                }
            }
        }
    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    }
}

function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([{ Judul: 'Buku Contoh', Penulis: 'Penulis Contoh', Stok: 10, Kategori: 'Pelajaran' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Perpus_SMAN1Ngambur.xlsx");
}

async function exportLaporan() {
    if (currentReportsData.length === 0) {
        return Swal.fire('Data Kosong', 'Tidak ada data laporan untuk diexport.', 'warning');
    }

    Swal.fire({ title: 'Membuat Laporan Excel...', text: 'Mohon tunggu sebentar', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const canvas = document.getElementById('loanChart');
    const chartImage = canvas ? canvas.toDataURL('image/png') : null;

    const totalDipinjam = currentReportsData.filter(x => x.status === 'Dipinjam').length;
    const totalKembali = currentReportsData.filter(x => x.status !== 'Dipinjam').length;
    const totalDendaRp = currentReportsData.reduce((acc, curr) => acc + (Number(curr.denda) || 0), 0);

    const dataForExcel = currentReportsData.map(i => {
        // LOGIKA TANGGAL KEMBALI UNTUK EXPORT JUGA DIPERBAIKI
        let tglKembaliTeks = '-';
        if (i.status !== 'Dipinjam') {
            const tgl = i.tgl_kembali || i.tanggal_kembali || i.updated_at || i.updatedAt;
            tglKembaliTeks = tgl ? new Date(tgl).toLocaleDateString('id-ID') : '-';
        }

        return {
            peminjam: i.nama_peminjam,
            kelas: i.kelas_peminjam || "-",
            buku: i.judul,
            kategori: i.kategori_pinjam || i.kategori || "Umum",
            tgl_pinjam: new Date(i.tgl_pinjam).toLocaleDateString('id-ID'),
            tgl_kembali: tglKembaliTeks,
            status: i.status,
            denda: `Rp ${Number(i.denda).toLocaleString('id-ID')}`,
            aksi: i.status === 'Dipinjam' ? 'Belum dikembalikan' : 'Sudah dikembalikan'
        };
    });

    try {
        const res = await fetch(`${API}/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: dataForExcel,
                chartImage: chartImage,
                stats: {
                    totalDipinjam: totalDipinjam,
                    totalKembali: totalKembali,
                    totalDenda: `Rp ${totalDendaRp.toLocaleString('id-ID')}`
                }
            })
        });

        if (!res.ok) throw new Error('Gagal export dari server');

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "Laporan_Perpustakaan_SMAN1Ngambur.xlsx";
        document.body.appendChild(a);
        a.click();
        a.remove();
        
        Swal.close();
        Toast.fire({ icon: 'success', title: 'Laporan berhasil diunduh' });
    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    }
}

function cetakStruk(nama, kelas, judul, tanggal, denda = 0, status = 'Dipinjam') {
    const tglFormat = new Date(tanggal).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
    
    const dendaFormat = denda > 0 ? `Rp ${Number(denda).toLocaleString('id-ID')}` : '-';
    const dendaStyle = denda > 0 ? "color: red; font-weight: bold;" : "";

    const printWindow = window.open('', '_blank', 'width=400,height=600');
    
    const htmlContent = `
        <html>
        <head>
            <title>Struk Peminjaman - SMAN 1 Ngambur</title>
            <style>
                body { font-family: 'Courier New', Courier, monospace; padding: 20px; color: #000; width: 300px; margin: 0 auto; }
                .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 15px; }
                .header h2 { margin: 0; font-size: 16px; line-height: 1.4; }
                .header p { margin: 5px 0 0; font-size: 12px; }
                .content { margin-bottom: 20px; font-size: 14px; }
                table { width: 100%; border-collapse: collapse; }
                td { padding: 4px 0; vertical-align: top; }
                .label { width: 35%; font-weight: bold; }
                .footer { text-align: center; border-top: 2px dashed #000; padding-top: 15px; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>PERPUSTAKAAN<br>SMAN 1 NGAMBUR</h2>
                <p>Bukti Transaksi Peminjaman</p>
            </div>
            <div class="content">
                <table>
                    <tr><td class="label">Nama</td><td>: ${nama}</td></tr>
                    <tr><td class="label">Kelas</td><td>: ${kelas}</td></tr>
                    <tr><td class="label">Judul</td><td>: ${judul}</td></tr>
                    <tr><td class="label">Tgl Pinjam</td><td>: ${tglFormat}</td></tr>
                    <tr><td class="label">Status</td><td>: ${status}</td></tr>
                    <tr><td class="label" style="${dendaStyle}">Denda</td><td style="${dendaStyle}">: ${dendaFormat}</td></tr>
                </table>
            </div>
            <div class="footer">
                <p>Harap kembalikan buku tepat waktu.<br>(Maksimal 7 Hari)</p>
                <p>Terima kasih!</p>
            </div>
            <script>
                window.onload = function() { 
                    window.print(); 
                    setTimeout(() => window.close(), 500);
                }
            </script>
        </body>
        </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
}

function logoutAdmin() {
    Swal.fire({
        title: 'Yakin ingin keluar?',
        text: 'Anda harus login kembali untuk masuk.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Ya, Keluar!',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            sessionStorage.clear(); 
            window.location.href = 'login.html'; 
        }
    });
}

window.onload = () => {
    const role = sessionStorage.getItem('userRole');
    
    if (role === 'staff') {
        document.getElementById('menu-dash').style.display = 'none';
        document.getElementById('menu-lap').style.display = 'none';
        
        document.getElementById('p-dash').classList.remove('active');
        document.getElementById('menu-dash').classList.remove('active');
        const bookMenu = document.getElementById('menu-books');
        nav('p-books', bookMenu);
        
    } else {
        nav('p-dash', document.getElementById('menu-dash'));
    }
};
