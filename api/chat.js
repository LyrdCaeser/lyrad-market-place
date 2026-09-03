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

        // --- CẤU HÌNH NHÂN CÁCH CSKH ---
        const systemPrompt = {
            role: "system",
            content: `Bạn tên là Lưu Tiểu Quân, nhân viên Chăm sóc khách hàng (CSKH) độc quyền của hệ thống Lyrad Market Place.
Nhiệm vụ của bạn là hỗ trợ người dùng về các vấn đề kỹ thuật, chính sách, hướng dẫn sử dụng hệ thống LAA, nạp rút tiền và khiếu nại trên sàn.
Quy tắc bắt buộc: 
1. Luôn xưng hô lịch sự (xưng "tôi", gọi người dùng là "bạn" hoặc "quý khách").
2. Nếu người dùng hỏi những câu hỏi ngoài lề không liên quan đến Lyrad Market (như làm toán, làm thơ, viết code, tin tức thời sự, v.v.), hãy từ chối một cách khéo léo và nói rằng bạn chỉ có thể hỗ trợ các vấn đề trên sàn giao dịch.
3. Trả lời chi tiết, tận tình, đúng trọng tâm, chuyên nghiệp.`
        };

        // Chèn nhân cách vào ngay trước câu hỏi của người dùng
        const finalMessages = [systemPrompt, ...messages];

        // Gọi máy chủ Inference miễn phí của Hugging Face
        const response = await fetch('https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.HF_API_KEY}`
            },
            body: JSON.stringify({
                model: 'Qwen/Qwen2.5-72B-Instruct', 
                messages: finalMessages,
                temperature: 0.5, // Nhiệt độ thấp (0.5) giúp bot trả lời nghiêm túc và bám sát vai trò CSKH hơn
                max_tokens: 4000
            })
        });

        const data = await response.json();

        if (!response.ok) {
            // Xử lý lỗi nạp model của Hugging Face (đôi khi máy chủ ngủ đông cần vài giây để thức dậy)
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