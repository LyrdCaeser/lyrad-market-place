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

        // Chuyển đổi dữ liệu chuẩn OpenAI sang chuẩn Google Gemini
        let systemInstruction = null;
        const geminiContents = [];

        for (const msg of messages) {
            if (msg.role === 'system') {
                systemInstruction = { parts: [{ text: msg.content }] };
            } else {
                geminiContents.push({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                });
            }
        }

        const requestBody = {
            contents: geminiContents,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4000
            }
        };

        if (systemInstruction) {
            requestBody.system_instruction = systemInstruction;
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: { message: "Thiếu GEMINI_API_KEY trên Vercel." } });
        }

        // Gọi Google Gemini 1.5 Flash - Nhanh, thông minh hơn GPT-3.5 và siêu ổn định
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'Lỗi từ Google Gemini');
        }

        // Đóng gói trả về frontend
        let aiText = "Lỗi: Không thể trích xuất nội dung từ Gemini.";
        if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts.length > 0) {
            aiText = data.candidates[0].content.parts[0].text;
        }

        res.status(200).json({
            choices: [
                { message: { content: aiText } }
            ]
        });

    } catch (error) {
        console.error("Lỗi API Chat:", error);
        res.status(500).json({ error: { message: error.message } });
    }
}