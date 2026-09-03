// api/chat.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: { message: "Method Not Allowed" } });
    }

    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: { message: "Dữ liệu messages không hợp lệ." } });
        }

        // Gọi máy chủ Inference miễn phí của Hugging Face
        const response = await fetch('https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.HF_API_KEY}`
            },
            body: JSON.stringify({
                model: 'Qwen/Qwen2.5-72B-Instruct', 
                messages: messages,
                temperature: 0.7,
                max_tokens: 5000
            })
        });

        const data = await response.json();

        if (!response.ok) {
            // Xử lý lỗi nạp model của Hugging Face (đôi khi máy chủ cần vài giây để "thức dậy")
            if (data.error && data.error.includes("currently loading")) {
                 return res.status(503).json({ 
                     choices: [{ message: { content: "Hệ thống CSKH đang khởi động lại, quý khách vui lòng gửi lại tin nhắn sau 10 giây nhé!" } }] 
                 });
            }
            throw new Error(data.error || 'Lỗi kết nối Hugging Face');
        }

        res.status(200).json(data);

    } catch (error) {
        console.error("Lỗi API Chat:", error);
        res.status(500).json({ error: { message: error.message } });
    }
}