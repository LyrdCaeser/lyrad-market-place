// File: api/admin-users.js
const { Pool } = require('pg');

// Vercel Serverless Function sử dụng CHUỖI KẾT NỐI REAL NEON DB CỦA BẠN
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_b7dlXHyhDZ3o@ep-dawn-sunset-azv8vlwh-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
});

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      // Lấy data đổ vào Bảng Điều Khiển LAA Admin
      const result = await pool.query('SELECT uid, name, level, status FROM lyrad_users ORDER BY created_at DESC');
      return res.status(200).json(result.rows);
    } catch (error) {
      console.error("Lỗi Neon DB:", error);
      return res.status(500).json({ error: "Lỗi Server Internal" });
    }
  }
}