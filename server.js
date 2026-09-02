const express = require('express');
const { Pool } = require('pg'); // Yêu cầu thư viện pg từ package.json
const path = require('path');

const app = express();
// Tăng giới hạn payload lên 50MB vì có upload Ảnh/Video Base64
app.use(express.json({ limit: '50mb' })); 
app.use(express.static(path.join(__dirname, 'public'))); // Đặt file index.html vào thư mục 'public'

// Kết nối với Neon DB bằng Connection String
const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_b7dlXHyhDZ3o@ep-dawn-sunset-azv8vlwh-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
});

// API Lấy toàn bộ dữ liệu từ DB
app.get('/api/data', async (req, res) => {
    try {
        const result = await pool.query('SELECT db_key, db_data FROM lyrad_db_storage');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API Cập nhật dữ liệu vào DB (Ghi đè mảng JSON hiện tại)
app.post('/api/data', async (req, res) => {
    const { key, value } = req.body;
    try {
        await pool.query(
            `INSERT INTO lyrad_db_storage (db_key, db_data) 
             VALUES ($1, $2) 
             ON CONFLICT (db_key) DO UPDATE SET db_data = $2, last_updated = CURRENT_TIMESTAMP`,
            [key, JSON.stringify(value)]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Lyrad Market Backend đang chạy tại Port ${PORT}`));