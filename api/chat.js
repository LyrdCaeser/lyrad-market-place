// api/chat.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: { message: "Method Not Allowed" } });
    }

    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: { message: "Dữ liệu không hợp lệ." } });
        }

        // Lấy câu hỏi mới nhất từ người dùng
        const lastUserMsg = messages.filter(m => m.role === 'user').pop();
        const userText = lastUserMsg ? lastUserMsg.content.toLowerCase() : '';

        let reply = "";

        // =====================================================================
        // BỘ QUY TẮC TRẢ LỜI CỐ ĐỊNH (CSKH LƯU TIỂU QUÂN)
        // =====================================================================

        // 1. Chào hỏi & Tương tác cơ bản
        if (userText.includes("chào") || userText.includes("hi") || userText.includes("hello")) {
            reply = "Xin chào! Tôi là Lưu Tiểu Quân - CSKH I của Lyrad Market Place. Tôi có thể giúp gì cho bạn hôm nay?";
        } 
        else if (userText.includes("cảm ơn") || userText.includes("thanks") || userText.includes("tks")) {
            reply = "Dạ không có gì ạ! Nếu cần hỗ trợ thêm bất cứ vấn đề gì, bạn cứ nhắn tin cho tôi nhé. Chúc bạn một ngày tốt lành!";
        } 
        else if (userText.includes("bạn là ai") || userText.includes("tên gì") || userText.includes("bot")) {
            reply = "Tôi là Lưu Tiểu Quân, trợ lý ảo CSKH tự động được phát triển riêng cho Lyrad Market Place để hỗ trợ bạn 24/7.";
        } 
        
        // 2. Nạp/Rút tiền & Thanh toán
        else if (userText.includes("nạp") || userText.includes("rút") || userText.includes("thanh toán") || userText.includes("tiền")) {
            reply = "Lyrad Market Place hiện hỗ trợ xử lý giao dịch qua ví điện tử MoMo cũng như các cổng quốc tế như PayPal và Stripe. Bạn có thể kiểm tra số dư và lịch sử giao dịch tại mục 'Hòm Thư Của Tôi'.";
        } 
        else if (userText.includes("momo") || userText.includes("paypal") || userText.includes("stripe")) {
            reply = "Hệ thống thanh toán của chúng tôi được bảo mật tự động. Nếu khoản thanh toán hoặc giao dịch đăng ký của bạn chưa được cập nhật thành công, vui lòng đợi từ 5-10 phút hoặc tạo Ticket báo lỗi.";
        }

        // 3. Tài khoản & Bảo mật (Quên pass, mất acc, scam)
        else if (userText.includes("mật khẩu") || userText.includes("quên pass") || userText.includes("đăng nhập")) {
            reply = "Để bảo mật thông tin, nếu bạn quên mật khẩu hoặc gặp lỗi đăng nhập, vui lòng sử dụng chức năng 'Quên mật khẩu' ở ngoài trang chủ. Nếu tài khoản bị khóa, hãy liên hệ Admin.";
        } 
        else if (userText.includes("hack") || userText.includes("scam") || userText.includes("lừa đảo") || userText.includes("uy tín")) {
            reply = "Lyrad Market Place nghiêm cấm mọi hành vi lừa đảo! Nếu bạn phát hiện người dùng hoặc sản phẩm có dấu hiệu scam, hãy dùng ngay chức năng 'Tố Cáo' để hệ thống xử lý nghiêm ngặt.";
        }

        // 4. Mua bán, Ứng dụng & Dành cho Creator
        else if (userText.includes("ứng dụng") || userText.includes("trò chơi") || userText.includes("tải") || userText.includes("cài đặt")) {
            reply = "Bạn có thể tìm, khám phá và tải về các Ứng dụng/Trò chơi mới nhất ngay trên giao diện chính của sàn. Nếu tải về gặp lỗi, hãy kiểm tra lại kết nối mạng nhé.";
        } 
        else if (userText.includes("creator") || userText.includes("bán") || userText.includes("đăng bài") || userText.includes("diễn đàn")) {
            reply = "Chào mừng bạn đến với cộng đồng sáng tạo! Bạn có thể giao lưu tại 'Diễn đàn Creator' ở menu trên cùng. Để đăng bán sản phẩm, hãy đảm bảo bạn đã đọc kỹ chính sách điều khoản của sàn.";
        }

        // 5. Hệ thống LAA & Khiếu nại (Ticket, Admin)
        else if (userText.includes("laa") || userText.includes("hệ thống laa")) {
            reply = "LAA (Quản Trị Tố Cáo) là hệ thống kiểm duyệt và quản lý độc quyền của Lyrad Market Place, giúp duy trì môi trường giao dịch an toàn và minh bạch cho mọi thành viên.";
        } 
        else if (userText.includes("tố cáo") || userText.includes("ticket") || userText.includes("lỗi") || userText.includes("bug")) {
            reply = "Để báo lỗi hệ thống, khiếu nại giao dịch hoặc tố cáo vi phạm, bạn hãy bấm vào nút 'Tạo Ticket Tố Cáo' ở cột bên trái. Ban quản trị sẽ tiếp nhận và xử lý sớm nhất!";
        } 
        else if (userText.includes("admin") || userText.includes("liên hệ") || userText.includes("chủ sàn") || userText.includes("nph qh")) {
            reply = "Hệ thống Lyrad Market Place được phát triển và quản lý độc quyền bởi NPH QH. Để liên hệ trực tiếp với Ban Quản Trị, bạn vui lòng sử dụng kênh 'Admin Panel - Manager' nhé.";
        }

        // 6. Câu lệnh chửi tục / Tiêu cực (Phòng vệ cơ bản)
        else if (userText.includes("ngu") || userText.includes("cút") || userText.includes("lỏ") || userText.includes("chó")) {
            reply = "Xin lỗi nếu hệ thống mang lại trải nghiệm chưa tốt cho bạn. Vui lòng sử dụng ngôn từ lịch sự. Nếu có bức xúc về dịch vụ, bạn có thể gửi phản hồi qua mục Tạo Ticket ạ.";
        }

        // 7. Câu trả lời Mặc định (Fallback - Khi người dùng gõ từ khóa không có trong danh sách)
        else {
            reply = "Cảm ơn bạn đã nhắn tin! Lưu Tiểu Quân hiện đã ghi nhận thông tin của bạn. Tuy nhiên, để được hỗ trợ chính xác nhất về các vấn đề kỹ thuật hoặc tài khoản, bạn vui lòng chọn mục 'Tạo Ticket Tố Cáo' để Admin trực tiếp xử lý nhé!";
        }

        // =====================================================================

        // Trả về đúng định dạng JSON chuẩn cho Frontend hiển thị
        return res.status(200).json({
            choices: [
                {
                    message: {
                        role: "assistant",
                        content: reply
                    }
                }
            ]
        });

    } catch (error) {
        console.error("Lỗi Server:", error);
        return res.status(500).json({ error: { message: "Lỗi xử lý phản hồi." } });
    }
}