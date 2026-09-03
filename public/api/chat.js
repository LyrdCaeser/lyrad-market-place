// api/chat.js
export default async function handler(req, res) {
    // Chỉ xử lý method POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: { message: "Method Not Allowed" } });
    }

    try {
        // Lấy lịch sử tin nhắn từ frontend (mảng các object {role, content})
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: { message: "Dữ liệu messages không hợp lệ." } });
        }

        // Gọi API của OpenRouter
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Biến môi trường chứa API Key của OpenRouter
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                // Các Header khuyên dùng của OpenRouter để không bị chặn
                'HTTP-Referer': 'https://lyradmarketplace.vercel.app', 
                'X-Title': 'Lyrad Market Place' 
            },
            body: JSON.stringify({
                // Sử dụng model miễn phí/giá rẻ trên OpenRouter (có thể đổi thành model khác tuỳ ý)
                model: 'google/gemini-2.5-flash', 
                messages: messages,
                max_tokens: 10000,
                temperature: 0.7
            })
        });

        const data = await response.json();

        // Xử lý lỗi nếu OpenRouter từ chối (vd: sai key, lỗi server)
        if (!response.ok) {
            throw new Error(data.error?.message || 'Lỗi không xác định từ OpenRouter');
        }

        // Trả data về đúng định dạng frontend cần
        res.status(200).json(data);

    } catch (error) {
        console.error("Lỗi API Chat:", error);
        res.status(500).json({ error: { message: error.message } });
    }
}