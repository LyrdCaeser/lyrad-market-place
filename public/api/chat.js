// api/chat.js
export default async function handler(req, res) {
    // Chỉ xử lý method POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: { message: "Method Not Allowed" } });
    }

    try {
        // Lấy lịch sử tin nhắn từ frontend gửi lên
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: { message: "Dữ liệu messages không hợp lệ." } });
        }

        // Gọi API của OpenAI
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Bắt buộc phải cài biến môi trường OPENAI_API_KEY trên Vercel
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo', // Có thể đổi thành 'gpt-4o' hoặc 'gpt-4-turbo'
                messages: messages,
                max_tokens: 10000,        // Giới hạn độ dài câu trả lời
                temperature: 0.7        // Độ sáng tạo của AI
            })
        });

        const data = await response.json();

        // Xử lý lỗi nếu OpenAI từ chối (vd: sai key, hết tiền, lỗi server)
        if (!response.ok) {
            throw new Error(data.error?.message || 'Lỗi không xác định từ OpenAI');
        }

        // Trả data về đúng định dạng frontend cần: { choices: [ { message: { content: "..." } } ] }
        res.status(200).json(data);

    } catch (error) {
        console.error("Lỗi API Chat:", error);
        res.status(500).json({ error: { message: error.message } });
    }
}