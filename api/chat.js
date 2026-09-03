// api/chat.js
export default async function handler(req, res) {
    // Chỉ xử lý method POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: { message: "Method Not Allowed" } });
    }

    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: { message: "Dữ liệu messages không hợp lệ." } });
        }

        // 1. Chuyển đổi định dạng lịch sử chat để khớp với Gemini
        let systemInstruction = null;
        const geminiContents = [];

        for (const msg of messages) {
            if (msg.role === 'system') {
                // Tách riêng prompt hệ thống
                systemInstruction = { parts: [{ text: msg.content }] };
            } else {
                // Đổi 'assistant' thành 'model' theo chuẩn Google
                geminiContents.push({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                });
            }
        }

        // Cấu hình Request Body cho Gemini
        const requestBody = {
            contents: geminiContents,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 8000
            }
        };

        if (systemInstruction) {
            requestBody.system_instruction = systemInstruction;
        }

        // Lấy API Key từ biến môi trường
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: { message: "Hệ thống thiếu GEMINI_API_KEY. Hãy thêm vào Vercel Settings." } });
        }

        // 2. Gọi Google Gemini API (model 1.5-flash cực nhanh)
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        // Xử lý lỗi từ Google
        if (!response.ok) {
            throw new Error(data.error?.message || 'Lỗi không xác định từ Google Gemini API');
        }

        // 3. Trích xuất câu trả lời và đóng gói lại y hệt chuẩn frontend đang cần
        let aiText = "Lỗi: Không thể trích xuất nội dung từ Gemini.";
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts.length > 0) {
            aiText = data.candidates[0].content.parts[0].text;
        }

        res.status(200).json({
            choices: [
                { message: { content: aiText } }
            ]
        });

    } catch (error) {
        console.error("Lỗi API Chat Gemini:", error);
        res.status(500).json({ error: { message: error.message } });
    }
}