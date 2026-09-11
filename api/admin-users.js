// File: api/admin-users.js
const { Pool } = require('pg');

// Vercel Serverless Function sử dụng CHUỖI KẾT NỐI REAL NEON DB CỦA BẠN
const pool = new Pool({
  connectionString: process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL,
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