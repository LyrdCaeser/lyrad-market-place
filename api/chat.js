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

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'mixtral-8x7b-32768', // Model cốt lõi siêu ổn định của Groq
                messages: messages,
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'Lỗi kết nối Groq');
        }

        res.status(200).json(data);

    } catch (error) {
        console.error("Lỗi API Chat:", error);
        res.status(500).json({ error: { message: error.message } });
    }
}