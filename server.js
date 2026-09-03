require('dotenv').config(); // Load biến môi trường từ file .env (Để giấu kín API Key)
const express = require('express');
const { Pool } = require('pg'); // Yêu cầu thư viện pg từ package.json
const path = require('path');
const cors = require('cors'); // Bổ sung CORS để cho phép Vercel gọi API từ xa

const app = express();

// Cấu hình CORS
app.use(cors({
    origin: '*', // Cho phép mọi nguồn (Có thể đổi '*' thành link Vercel của bạn để bảo mật hơn)
    methods: ['GET', 'POST'],
    credentials: true
}));

// Tăng giới hạn payload lên 50MB vì có upload Ảnh/Video Base64
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public'))); // Đặt file index.html vào thư mục 'public'

// Kết nối với Neon DB bằng Connection String
const pool = new Pool({
    connectionString: postgresql://neondb_owner:npg_D0dKZeQx8tSC@ep-wispy-recipe-b3lsg7w2-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
});

// ==========================================
// MODULE NEON DATABASE
// ==========================================

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

// ==========================================
// MODULE OPENAI CHATBOT (BẢO MẬT API KEY TẠI BACKEND)
// ==========================================

// Cổng giao tiếp trung gian với OpenAI
app.post('/api/chat', async (req, res) => {
    try {
        // Lấy key từ file .env (local) hoặc Environment (Render)
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ 
                error: { message: "Lỗi Backend: Chưa cấu hình OPENAI_API_KEY trong biến môi trường!" } 
            });
        }

        // Gọi API thẳng từ Backend lên OpenAI (Node.js 18+ đã có sẵn hàm fetch)
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: req.body.messages,
                temperature: 0.7,
                max_tokens: 800
            })
        });
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error("Lỗi OpenAI API:", error);
        res.status(500).json({ error: { message: "Lỗi kết nối máy chủ AI từ Backend." } });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Lyrad Market Backend đang chạy tại Port ${PORT}`));