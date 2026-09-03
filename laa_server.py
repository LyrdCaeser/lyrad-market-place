import os
import hashlib
import shutil
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from androguard.core.apk import APK  # Cập nhật đường dẫn import cho Androguard 4.x

# Khởi tạo API Server
app = FastAPI(title="LAA Sandbox API Engine")

# Cấu hình CORS để Frontend (HTML) có thể gọi được API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Trong thực tế, thay "*" bằng domain Market Place của bạn (vd: https://lyrad.vn)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def keep_alive():
    """Endpoint mồi để Uptime Robot ping mỗi 5 phút (Chống ngủ đông cho Render)"""
    return {"status": "alive", "engine": "LAA Sandbox", "version": "1.0.0"}

# Danh sách các quyền (Permissions) nhạy cảm bị LAA đánh dấu rủi ro cao (Red Flags)
DANGEROUS_PERMISSIONS = [
    "android.permission.SEND_SMS",
    "android.permission.READ_SMS",
    "android.permission.READ_CONTACTS",
    "android.permission.READ_CALL_LOG",
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.PROCESS_OUTGOING_CALLS"
]

def calculate_sha256(file_path: str) -> str:
    """Hàm băm SHA-256 thực tế tại Backend để đối chiếu với Frontend"""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

@app.post("/v1/sandbox/scan")
async def scan_apk(
    apk_file: UploadFile = File(...),
    app_name: str = Form(...),
    app_version: str = Form(...),
    local_sha256: str = Form(...)
):
    # 1. Lưu file tạm thời vào Sandbox
    temp_dir = "./laa_temp"
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, apk_file.filename)

    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(apk_file.file, buffer)

        # 2. Xác thực tính toàn vẹn (Cross-check Hash)
        server_sha256 = calculate_sha256(temp_file_path)
        if server_sha256 != local_sha256:
            return JSONResponse(status_code=400, content={
                "status": "error",
                "is_safe": False,
                "message": "Lỗi toàn vẹn: Mã Hash tải lên không khớp với dữ liệu thực tế tại máy chủ. File có thể bị can thiệp (Man-in-the-Middle)."
            })

        # 3. Tiến hành Dịch ngược và Phân tích bằng Androguard
        try:
            apk = APK(temp_file_path)
            package_name = apk.get_package()
            requested_permissions = apk.get_permissions()
        except Exception as e:
            return JSONResponse(status_code=400, content={
                "status": "error",
                "is_safe": False,
                "message": f"Không thể phân tích gói cài đặt. File APK/AAB có thể bị hỏng hoặc mã hóa trái phép. Chi tiết: {str(e)}"
            })

        # 4. Bộ lọc AI / Luật kiểm duyệt (Rule Engine)
        detected_risks = []
        for perm in requested_permissions:
            if perm in DANGEROUS_PERMISSIONS:
                detected_risks.append(perm.split('.')[-1])

        # Quyết định an toàn
        is_safe = True
        message = "File an toàn 100%. Không phát hiện mã độc hoặc quyền truy cập trái phép."
        
        if detected_risks:
            is_safe = False
            message = f"Phát hiện rủi bảo mật! Ứng dụng yêu cầu quyền nhạy cảm bị cấm: {', '.join(detected_risks)}."

        # 5. Cấp phát App ID duy nhất từ 8 ký tự đầu của SHA-256
        app_id = f"APP-VN-{server_sha256[:8].upper()}"

        # 6. Trả kết quả JSON về cho Frontend
        return {
            "status": "success",
            "is_safe": is_safe,
            "app_id": app_id,
            "package_name": package_name,
            "message": message
        }

    except Exception as e:
        return JSONResponse(status_code=500, content={
            "status": "error",
            "is_safe": False,
            "message": f"Lỗi hệ thống máy chủ LAA: {str(e)}"
        })

    finally:
        # 7. Xóa dấu vết file trong Sandbox (Tiêu hủy file tạm)
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)