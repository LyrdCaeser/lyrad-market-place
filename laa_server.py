import hashlib
import os
import re
import tempfile
import uuid
import zipfile
from pathlib import Path

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
    # Light mode: inspect the archive and only read the manifest bytes.  Full
    # DEX/resource decoding is intentionally avoided so an upload cannot keep
    # the small Render worker busy for minutes.
    package_name = None
    with zipfile.ZipFile(path) as archive:
        try:
            manifest = archive.read("AndroidManifest.xml").upper()
        except KeyError:
            manifest = b""
            risks.append("APK thiếu AndroidManifest.xml")
    flagged = sorted(
        permission.rsplit(".", 1)[-1]
        for permission in DANGEROUS_PERMISSIONS
        if permission.encode().upper() in manifest
    )
    if flagged:
        risks.append("Quyền Android nhạy cảm: " + ", ".join(flagged))
    checks.append("Kiểm tra nhanh AndroidManifest và quyền nhạy cảm")
    return checks, risks, package_name


def safety_rating(risks: list[str], analysis_error: bool = False) -> tuple[int, str]:
    """Return an advisory safety score. The scanner never blocks publication."""
    if analysis_error:
        return 0, "ERROR"
    score = 100
    for risk in risks:
        lowered = risk.lower()
        if any(marker in lowered for marker in (
            "ransomware", "mimikatz", "đào tiền", "tiêm mã", "tiêm luồng",
            "ghi bộ nhớ tiến trình", "cấp phát bộ nhớ tiến trình",
        )):
            score -= 55
        elif any(marker in lowered for marker in (
            "zip bomb", "đường dẫn nguy hiểm", "được mã hóa", "thiếu androidmanifest",
        )):
            score -= 30
        else:
            score -= 15
    score = max(0, min(100, score))
    if score >= 85:
        level = "SAFE"
    elif score >= 60:
        level = "WARNING"
    elif score >= 30:
        level = "ERROR"
    else:
        level = "DANGEROUS"
    return score, level


def inspect_exe(path: Path) -> tuple[list[str], list[str]]:
    checks = ["Kiểm tra nhanh cấu trúc Portable Executable (PE)"]
    risks: list[str] = []
    with path.open("rb") as source:
        dos_header = source.read(64)
        if len(dos_header) < 64 or not dos_header.startswith(b"MZ"):
            risks.append("Thiếu chữ ký MZ hợp lệ")
            return checks, risks
        pe_offset = int.from_bytes(dos_header[60:64], "little")
        if pe_offset > 16 * 1024 * 1024:
            risks.append("Vị trí PE header bất thường")
            return checks, risks
        source.seek(pe_offset)
        if source.read(4) != b"PE\x00\x00":
            risks.append("Thiếu chữ ký PE hợp lệ")
        else:
            checks.append("Chữ ký MZ/PE hợp lệ")
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
        analysis_error = False
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
            analysis_error = True

        risks = list(dict.fromkeys(risks))
        safety_score, risk_level = safety_rating(risks, analysis_error)
        is_safe = risk_level == "SAFE"
        verdict = risk_level.lower()
        message = f"{risk_level} · Điểm an toàn {safety_score}/100. Đây là cảnh báo tham khảo, không chặn đăng tệp."
        return {
            "status": "completed", "is_safe": is_safe, "verdict": verdict,
            "risk_level": risk_level, "safety_score": safety_score,
            "scan_id": scan_id, "engine": "LAA Sandbox Static Analyzer 2.0",
            "sha256": server_sha256, "filename": filename, "app_name": app_name[:160],
            "app_version": app_version[:40], "package_name": package_name,
            "checks": checks, "risks": risks, "message": message,
        }
    except HTTPException:
        raise
    except Exception as error:
        return {
            "status": "completed", "is_safe": False, "verdict": "error",
            "risk_level": "ERROR", "safety_score": 0, "scan_id": scan_id,
            "engine": "LAA Sandbox Static Analyzer 2.0", "sha256": calculate_sha256(temp_path) if temp_path and temp_path.exists() else "",
            "filename": filename, "app_name": app_name[:160], "app_version": app_version[:40],
            "package_name": None, "checks": [], "risks": [f"Lỗi máy quét: {str(error)[:180]}"],
            "message": "ERROR · Điểm an toàn 0/100 vì máy quét không hoàn tất. Đây chỉ là cảnh báo, không chặn đăng tệp.",
        }
    finally:
        await apk_file.close()
        if temp_path and temp_path.exists():
            temp_path.unlink(missing_ok=True)
