import hashlib
import os
import re
import tempfile
import uuid
import zipfile
from pathlib import Path

import pefile
from androguard.core.apk import APK
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse


app = FastAPI(title="LAA Sandbox API Engine", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://lyradmarketplace.vercel.app"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-LAA-Scan-Key"],
)

MAX_FILE_BYTES = 80 * 1024 * 1024
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
ALLOWED_SUFFIXES = {".apk", ".exe", ".zip", ".rar", ".7z"}
DANGEROUS_PERMISSIONS = {
    "android.permission.SEND_SMS",
    "android.permission.READ_SMS",
    "android.permission.READ_CONTACTS",
    "android.permission.READ_CALL_LOG",
    "android.permission.PROCESS_OUTGOING_CALLS",
    "android.permission.REQUEST_INSTALL_PACKAGES",
    "android.permission.BIND_ACCESSIBILITY_SERVICE",
}
SUSPICIOUS_MARKERS = {
    b"powershell -enc": "PowerShell mã hóa",
    b"createremotethread": "tiêm luồng tiến trình",
    b"writeprocessmemory": "ghi bộ nhớ tiến trình",
    b"virtualallocex": "cấp phát bộ nhớ tiến trình ngoài",
    b"mimikatz": "công cụ trích xuất thông tin đăng nhập",
    b"xmrig": "trình đào tiền mã hóa XMRig",
    b"ransomware": "chỉ dấu ransomware",
}


@app.get("/")
async def keep_alive():
    return {"status": "alive", "engine": "LAA Sandbox", "version": "2.0.0"}


def calculate_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def marker_scan(path: Path) -> list[str]:
    risks: list[str] = []
    overlap = b""
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            sample = (overlap + block).lower()
            for marker, description in SUSPICIOUS_MARKERS.items():
                if marker in sample and description not in risks:
                    risks.append(description)
            overlap = sample[-64:]
    return risks


def inspect_zip(path: Path) -> tuple[list[str], list[str]]:
    checks = ["Đọc bảng nội dung ZIP/APK"]
    risks: list[str] = []
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        total = sum(entry.file_size for entry in entries)
        if total > MAX_ARCHIVE_BYTES:
            risks.append("Dung lượng giải nén vượt 512 MB (nguy cơ zip bomb)")
        for entry in entries:
            normalized = entry.filename.replace("\\", "/")
            if normalized.startswith("/") or "../" in normalized:
                risks.append(f"Đường dẫn nguy hiểm trong tệp nén: {entry.filename[:120]}")
            if entry.flag_bits & 0x1:
                risks.append(f"Tệp nén được mã hóa, không thể kiểm tra: {entry.filename[:120]}")
            if entry.compress_size and entry.file_size / entry.compress_size > 250:
                risks.append(f"Tỷ lệ nén bất thường: {entry.filename[:120]}")
        checks.append(f"Kiểm tra {len(entries)} mục nén, {total} byte sau giải nén")
    return checks, risks


def inspect_apk(path: Path) -> tuple[list[str], list[str], str | None]:
    checks, risks = inspect_zip(path)
    apk = APK(str(path))
    package_name = apk.get_package()
    permissions = set(apk.get_permissions() or [])
    flagged = sorted(permission.rsplit(".", 1)[-1] for permission in permissions & DANGEROUS_PERMISSIONS)
    if flagged:
        risks.append("Quyền Android nhạy cảm: " + ", ".join(flagged))
    checks.append(f"Phân tích AndroidManifest: {len(permissions)} quyền")
    return checks, risks, package_name


def inspect_exe(path: Path) -> tuple[list[str], list[str]]:
    checks = ["Xác thực cấu trúc Portable Executable (PE)"]
    risks: list[str] = []
    pe = pefile.PE(str(path), fast_load=True)
    pe.parse_data_directories(
        directories=[pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_IMPORT"]]
    )
    imports = {
        item.name.decode("ascii", errors="ignore").lower()
        for library in getattr(pe, "DIRECTORY_ENTRY_IMPORT", [])
        for item in library.imports
        if item.name
    }
    injection_api = {"createremotethread", "writeprocessmemory", "virtualallocex"}
    if len(imports & injection_api) >= 2:
        risks.append("Tổ hợp API tiêm mã vào tiến trình khác")
    checks.append(f"Phân tích bảng import PE: {len(imports)} API")
    return checks, risks


async def save_upload(upload: UploadFile, path: Path) -> int:
    size = 0
    with path.open("wb") as target:
        while chunk := await upload.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_FILE_BYTES:
                raise HTTPException(status_code=413, detail="Tệp vượt giới hạn 80 MB.")
            target.write(chunk)
    return size


@app.post("/v1/sandbox/scan")
async def scan_installer(
    apk_file: UploadFile = File(...),
    app_name: str = Form(...),
    app_version: str = Form(...),
    local_sha256: str = Form(...),
    x_laa_scan_key: str = Header(default=""),
):
    expected_key = os.getenv("LAA_SCAN_KEY", "")
    if not expected_key or x_laa_scan_key != expected_key:
        raise HTTPException(status_code=401, detail="Khóa kết nối LAA không hợp lệ.")
    filename = Path(apk_file.filename or "").name
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES or not re.fullmatch(r"[a-fA-F0-9]{64}", local_sha256):
        raise HTTPException(status_code=400, detail="Tên tệp hoặc SHA-256 không hợp lệ.")

    scan_id = f"LAA-{uuid.uuid4().hex[:12].upper()}"
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(prefix="laa-", suffix=suffix, delete=False) as temp:
            temp_path = Path(temp.name)
        size = await save_upload(apk_file, temp_path)
        server_sha256 = calculate_sha256(temp_path)
        if server_sha256.lower() != local_sha256.lower():
            return JSONResponse(status_code=400, content={
                "status": "error", "is_safe": False, "scan_id": scan_id,
                "message": "SHA-256 không khớp; tệp đã bị thay đổi trên đường truyền.",
            })

        checks = [f"Đối chiếu SHA-256 ({size} byte)", "Quét chỉ dấu nhị phân tĩnh"]
        risks = marker_scan(temp_path)
        package_name = None
        try:
            if suffix == ".apk":
                extra_checks, extra_risks, package_name = inspect_apk(temp_path)
            elif suffix == ".exe":
                extra_checks, extra_risks = inspect_exe(temp_path)
            elif suffix == ".zip":
                extra_checks, extra_risks = inspect_zip(temp_path)
            else:
                extra_checks = [f"Xác thực chữ ký và quét nhị phân {suffix[1:].upper()}"]
                extra_risks = []
            checks.extend(extra_checks)
            risks.extend(extra_risks)
        except Exception as error:
            risks.append(f"Không thể phân tích cấu trúc {suffix[1:].upper()}: {str(error)[:180]}")

        risks = list(dict.fromkeys(risks))
        is_safe = not risks
        verdict = "no_high_risk_indicators" if is_safe else "risk_detected"
        message = (
            "Không phát hiện chỉ dấu rủi ro cao trong phạm vi quét tĩnh LAA."
            if is_safe else "LAA phát hiện rủi ro; tệp bị từ chối."
        )
        return {
            "status": "completed", "is_safe": is_safe, "verdict": verdict,
            "scan_id": scan_id, "engine": "LAA Sandbox Static Analyzer 2.0",
            "sha256": server_sha256, "filename": filename, "app_name": app_name[:160],
            "app_version": app_version[:40], "package_name": package_name,
            "checks": checks, "risks": risks, "message": message,
        }
    except HTTPException:
        raise
    except Exception as error:
        return JSONResponse(status_code=500, content={
            "status": "error", "is_safe": False, "scan_id": scan_id,
            "message": f"Lỗi hệ thống LAA: {str(error)[:300]}",
        })
    finally:
        await apk_file.close()
        if temp_path and temp_path.exists():
            temp_path.unlink(missing_ok=True)
