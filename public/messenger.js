/**
 * LYRAD MARKET PLACE - MESSENGER MODULE
 * Chuyên trách quản lý Messenger & Trực Tuyến.
 * Sử dụng ImgBB API để lưu trữ ảnh chat.
 */

// Đã tích hợp sẵn API Key ImgBB của bạn
const IMGBB_API_KEY = "4c433d58d2d8fe0bf07e0a88b4f7cf54";[cite: 7]

const msgTool = {
    chatBox: null,
    
    init: function() {
        this.chatBox = document.getElementById('messenger-list-area');[cite: 7]
        
        // ĐỒNG BỘ REALTIME: Tự động kéo dữ liệu mới từ Neon DB mỗi 1.5 giây
        // Giúp bên kia nhận tin nhắn ngay lập tức mà không cần F5
        setInterval(async () => {
            if (typeof fetchNeonDB === 'function') {
                await fetchNeonDB(); 
                this.renderChat();[cite: 7]
            }
        }, 1500);
        
        setTimeout(() => this.renderChat(), 500);[cite: 7]

        // Bắt sự kiện phím Enter cho ô chat
        const inputField = document.getElementById('messenger-input-field');[cite: 7]
        if(inputField) {
            inputField.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.send();[cite: 7]
            });
        }
    },

    // Kiểm tra và Cảnh báo Level
    checkLevel: function(reqLevel, featureName) {
        if(isAnonymous) { alert("Tài khoản Ẩn Danh cấm sử dụng tính năng Chat."); return false; }[cite: 7]
        if(currentUser.level < reqLevel) {
            alert(`🔒 Tính năng ${featureName} yêu cầu Level ${reqLevel}.\nLevel hiện tại của bạn: ${currentUser.level}. Hãy tích cực tham gia Diễn đàn để tăng Cấp!`);[cite: 7]
            return false;
        }
        return true;
    },

    // UI TÍCH HỢP: Bảng Picker Emoji & Ký Tự Đặc Biệt
    togglePicker: function(type) {
        if(!this.checkLevel(type === 'basic' ? 5 : 30, type === 'basic' ? "Emoji Cơ Bản" : "Ký Tự Đặc Biệt")) return;[cite: 7]

        let picker = document.getElementById('lyrad-emoji-picker');
        if(!picker) {
            picker = document.createElement('div');
            picker.id = 'lyrad-emoji-picker';
            // CSS tạo popup bảng Emoji nổi lên trên khung input
            picker.style.cssText = 'position:absolute; bottom:60px; left:12px; background:var(--bg-card); border:1px solid var(--border); border-radius:16px; padding:12px; box-shadow:var(--shadow-md); display:flex; flex-wrap:wrap; gap:10px; width:280px; max-height:180px; overflow-y:auto; z-index:1000; animation: fadeIn 0.2s ease;';
            document.getElementById('messenger-container').appendChild(picker);
        }

        // Tắt bảng nếu người dùng bấm lại vào nút đang mở
        if(picker.dataset.type === type && picker.style.display === 'flex') {
            picker.style.display = 'none';
            return;
        }

        picker.dataset.type = type;
        picker.style.display = 'flex';
        picker.innerHTML = '';

        // Dữ liệu Icon phong phú
        const emojis = type === 'basic' 
            ? ['😀','😂','🤣','❤️','😍','🙏','👍','😭','😘','🥰','🙄','😎','😡','🤢','😈','💀','💩','🤡','👽','👻','🔥','💯','🎉','✨','🌟','✅','❌','⚠️','💡','🚀'] 
            : ['( ͡° ͜ʖ ͡°)','¯\\_(ツ)_/¯','(╯°□°）╯︵ ┻━┻','ʕ•ᴥ•ʔ','(ง\'̀-\'́)ง','(づ￣ ³￣)づ','༼ つ ◕_◕ ༽つ','(⌐■_■)','(ʘ‿ʘ)','ಠ_ಠ','(T_T)','(^-^*)','(>_<)','(✯◡✯)'];

        emojis.forEach(em => {
            let span = document.createElement('span');
            span.innerText = em;
            span.style.cssText = 'cursor:pointer; font-size:22px; padding:4px; transition:transform 0.1s; user-select:none; display:inline-block;';
            span.onmouseover = () => span.style.transform = 'scale(1.3)';
            span.onmouseout = () => span.style.transform = 'scale(1)';
            span.onclick = () => {
                const input = document.getElementById('messenger-input-field');[cite: 7]
                input.value += em; 
                input.focus();
                picker.style.display = 'none'; // Tự động đóng bảng sau khi chọn
            };
            picker.appendChild(span);
        });
    },

    // Lv 5: Facebook Emoji
    emoji: function() {
        this.togglePicker('basic');
    },

    // Lv 30: Special Emoji
    special: function() {
        this.togglePicker('special');
    },

    // Lv 50: Text Format
    format: function() {
        if(!this.checkLevel(50, "Định Dạng Chữ")) return;[cite: 7]
        alert("Gõ cú pháp sau để đổi kiểu chữ:\n**chữ in đậm**\n*chữ in nghiêng*\n#Chữ lớn");[cite: 7]
    },

    // Lv 111: Tải ảnh lên ImgBB Server
    uploadImage: function(inputElement) {
        if(!this.checkLevel(111, "Gửi Ảnh Trực Tuyến")) { inputElement.value = ''; return; }[cite: 7]
        
        const file = inputElement.files[0];[cite: 7]
        if(!file) return;[cite: 7]

        const formData = new FormData();[cite: 7]
        formData.append("image", file);[cite: 7]

        alert("Đang tải ảnh lên máy chủ ImgBB...");[cite: 7]

        // Yêu cầu POST theo đúng tài liệu ImgBB
        fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {[cite: 7]
            method: "POST",[cite: 7]
            body: formData[cite: 7]
        })
        .then(response => response.json())[cite: 7]
        .then(data => {
            if (data && data.success) {[cite: 7]
                const imageUrl = data.data.url;[cite: 7]
                this.pushMessageToDB(null, imageUrl); // Render link ảnh ra khung chat[cite: 7]
                inputElement.value = ''; // Reset ô chọn file[cite: 7]
            } else {
                alert("Lỗi tải ảnh lên ImgBB: " + (data.error ? data.error.message : "Thất bại"));[cite: 7]
            }
        })
        .catch(err => {
            alert("Lỗi kết nối máy chủ ảnh: " + err.message);[cite: 7]
        });
    },

    // Gửi tin nhắn Text
    send: function() {
        if(isAnonymous) return alert("Tài khoản Ẩn Danh cấm nhắn tin!");[cite: 7]
        if(currentUser.status.includes('Mute') || currentUser.status.includes('Khóa')) return alert("Tài khoản bị cấm chat!");[cite: 7]
        
        const input = document.getElementById('messenger-input-field');[cite: 7]
        let text = input.value.trim();[cite: 7]
        if(!text) return;[cite: 7]
        
        // Basic parser cho Level 50+
        if(currentUser.level >= 50) {[cite: 7]
            text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');[cite: 7]
            text = text.replace(/\*(.*?)\*/g, '<i>$1</i>');[cite: 7]
            text = text.replace(/^#(.*)/g, '<span style="color:var(--primary); font-weight:bold; font-size:16px;">$1</span>');[cite: 7]
        }

        this.pushMessageToDB(text, null);[cite: 7]
        input.value = '';[cite: 7]
    },

    // Đẩy Dữ liệu Thật (Real data 100%) vào Neon Database
    pushMessageToDB: function(text, imgUrl) {
        let chatDB = globalDB[DB_KEY_CHAT] || [];[cite: 7]
        chatDB.push({
            id: 'MSG-' + Date.now(),[cite: 7]
            uid: currentUser.uid,[cite: 7]
            name: currentUser.name,[cite: 7]
            avatar: currentUser.avatar,[cite: 7]
            text: text,[cite: 7]
            imgUrl: imgUrl,[cite: 7]
            timestamp: Date.now()[cite: 7]
        });
        
        // Chỉ giữ 50 tin nhắn mới nhất để tránh lag Web Mobile
        if(chatDB.length > 50) chatDB = chatDB.slice(-50);[cite: 7]
        
        saveNeonDB(DB_KEY_CHAT, chatDB);[cite: 7]
        updateExpData(1); [cite: 7]
        this.renderChat();[cite: 7]
    },

    // Vẽ giao diện Chat
    renderChat: function() {
        if(!globalDB[DB_KEY_CHAT] || globalDB[DB_KEY_CHAT].length === 0) return;[cite: 7]
        
        let html = '';[cite: 7]
        const chats = globalDB[DB_KEY_CHAT];[cite: 7]
        
        chats.forEach(msg => {
            let isMe = msg.uid === currentUser.uid;[cite: 7]
            
            let content = '';[cite: 7]
            if(msg.text) content += `<span>${msg.text}</span>`;[cite: 7]
            if(msg.imgUrl) content += `<img src="${msg.imgUrl}" class="chat-msg-img">`;[cite: 7]

            html += `
                <div class="chat-msg-item ${isMe ? 'me' : ''}">
                    <img src="${msg.avatar}" class="chat-msg-avt">
                    <div style="max-width: 75%;">
                        <div class="chat-msg-author">${msg.name}</div>
                        <div class="chat-msg-bubble">${content}</div>
                    </div>
                </div>
            `;[cite: 7]
        });
        
        let isScrolledToBottom = this.chatBox.scrollHeight - this.chatBox.clientHeight <= this.chatBox.scrollTop + 10;[cite: 7]
        this.chatBox.innerHTML = html;[cite: 7]
        if(isScrolledToBottom) {
            this.chatBox.scrollTop = this.chatBox.scrollHeight;[cite: 7]
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    msgTool.init();[cite: 7]
});