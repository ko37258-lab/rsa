"""녹음 파일 길이 읽기. 긴 녹음을 20분씩 나눠 받아쓰려면 길이를 알아야 합니다.

ffmpeg 같은 큰 프로그램 없이 파일 머리만 읽습니다: wav · m4a/mp4/mov · flac · mp3.
그 밖의 형식(ogg·webm·aac 등)은 None을 돌려주고, 그때는 Gemini에 올린 뒤 길이를 계산합니다(filestt.py).
"""

import os
import struct

# 이보다 길게 나오면 파일 머리를 잘못 읽은 것으로 봅니다.
MAX_SECONDS = 24 * 3600


def duration_seconds(path: str) -> float | None:
    """녹음 길이(초). 읽지 못하면 None. 확장자와 파일 머리가 함께 맞을 때만 읽습니다
    (.aac의 ADTS 프레임을 mp3로 잘못 읽는 일이 없게)."""
    ext = os.path.splitext(path)[1].lower()
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            head = f.read(12)
            f.seek(0)
            if ext == ".wav" and head[:4] == b"RIFF" and head[8:12] == b"WAVE":
                sec = _wav(f, size)
            elif ext in (".m4a", ".mp4", ".m4v", ".mov") and head[4:8] in (b"ftyp", b"moov", b"mdat", b"free", b"skip", b"wide"):
                sec = _mp4(f, size)
            elif ext == ".flac":
                sec = _flac(f)
            elif ext == ".mp3":
                sec = _mp3(f, size)
            else:
                sec = None
    except Exception:  # 망가진 파일 머리는 '길이 모름'으로 봅니다 (Gemini에 올린 뒤 계산)
        return None
    return sec if sec is not None and 0 < sec < MAX_SECONDS else None


def _skip_id3(f) -> int:
    """파일 앞의 ID3 태그를 건너뛴 위치 (mp3·flac 앞에 붙기도 합니다)."""
    f.seek(0)
    head = f.read(10)
    if head[:3] != b"ID3" or len(head) < 10:
        return 0
    tag = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9]
    return 10 + tag + (10 if head[5] & 0x10 else 0)


def _wav(f, size: int) -> float | None:
    """RIFF 조각을 따라가며 초당 바이트(fmt)와 소리 크기(data)를 찾습니다."""
    f.seek(12)
    byte_rate = None
    while True:
        header = f.read(8)
        if len(header) < 8:
            return None
        cid, length = header[:4], struct.unpack("<I", header[4:])[0]
        if cid == b"fmt ":
            fmt = f.read(min(length, 16))
            byte_rate = struct.unpack("<I", fmt[8:12])[0]
            f.seek(length - len(fmt) + (length & 1), 1)
        elif cid == b"data":
            if not byte_rate:
                return None
            # 녹음 중에 끊긴 파일은 크기 칸이 비었거나(0·0xFFFFFFFF) 실제보다 클 수 있습니다.
            data = min(length, size - f.tell()) if 0 < length < 0xFFFFFFFF else size - f.tell()
            return data / byte_rate
        else:
            f.seek(length + (length & 1), 1)


def _boxes(f, start: int, end: int):
    """MP4 상자(box)를 차례로 돌려줍니다: (종류, 내용 시작, 내용 끝)."""
    pos = start
    while pos + 8 <= end:
        f.seek(pos)
        header = f.read(8)
        if len(header) < 8:
            return
        length, kind = struct.unpack(">I", header[:4])[0], header[4:]
        body = pos + 8
        if length == 1:
            length = struct.unpack(">Q", f.read(8))[0]
            body = pos + 16
        elif length == 0:
            length = end - pos
        if length < body - pos:
            return
        yield kind, body, min(pos + length, end)
        pos += length


def _mp4(f, size: int) -> float | None:
    """m4a·mp4·mov: moov 상자 안 mvhd에 적힌 길이(duration ÷ timescale)를 읽습니다. moov가 파일 끝에 있어도 됩니다."""
    for kind, body, end in _boxes(f, 0, size):
        if kind != b"moov":
            continue
        for inner, ibody, _iend in _boxes(f, body, end):
            if inner != b"mvhd":
                continue
            f.seek(ibody)
            version = f.read(4)[0]
            if version == 1:
                f.seek(16, 1)
                timescale, duration = struct.unpack(">IQ", f.read(12))
            else:
                f.seek(8, 1)
                timescale, duration = struct.unpack(">II", f.read(8))
            return duration / timescale if timescale else None
    return None


def _flac(f) -> float | None:
    """flac: 맨 앞 STREAMINFO의 샘플 수 ÷ 샘플링 주파수"""
    start = _skip_id3(f)
    f.seek(start)
    if f.read(4) != b"fLaC":
        return None
    header = f.read(4)
    if len(header) < 4 or header[0] & 0x7F != 0:
        return None
    info = f.read(18)
    rate = (info[10] << 12) | (info[11] << 4) | (info[12] >> 4)
    samples = ((info[13] & 0x0F) << 32) | struct.unpack(">I", info[14:18])[0]
    return samples / rate if rate and samples else None


_MP3_RATES = {3: (44100, 48000, 32000), 2: (22050, 24000, 16000), 0: (11025, 12000, 8000)}
_MP3_KBPS_V1 = (0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320)
_MP3_KBPS_V2 = (0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160)


def _frame(buf: bytes, i: int):
    """mp3(Layer III) 프레임 머리면 (프레임 길이, 샘플링 주파수, kbps, 프레임당 샘플 수, 모노인지), 아니면 None"""
    if i + 4 > len(buf) or buf[i] != 0xFF or buf[i + 1] & 0xE0 != 0xE0:
        return None
    version, layer = (buf[i + 1] >> 3) & 3, (buf[i + 1] >> 1) & 3
    rate_i, kbps_i, pad = (buf[i + 2] >> 2) & 3, buf[i + 2] >> 4, (buf[i + 2] >> 1) & 1
    if version == 1 or layer != 1 or rate_i == 3 or kbps_i in (0, 15):
        return None
    rate = _MP3_RATES[version][rate_i]
    kbps = (_MP3_KBPS_V1 if version == 3 else _MP3_KBPS_V2)[kbps_i]
    per_frame = 1152 if version == 3 else 576
    length = (144000 if version == 3 else 72000) * kbps // rate + pad
    return length, rate, kbps, per_frame, (buf[i + 3] >> 6) == 3


def _mp3(f, size: int) -> float | None:
    """mp3: 첫 프레임의 Xing·Info·VBRI 머리에 적힌 프레임 수로 계산하고, 없으면 앞쪽 프레임들의 평균 비트레이트로 계산합니다.
    우연히 프레임 머리처럼 보이는 바이트에 속지 않게, 바로 다음 프레임 머리까지 맞아야 프레임으로 봅니다."""
    start = _skip_id3(f)
    f.seek(start)
    buf = f.read(1024 * 1024)
    first = None
    for i in range(min(len(buf) - 4, 64 * 1024)):
        hdr = _frame(buf, i)
        if hdr and hdr[0] > 4 and (i + hdr[0] + 4 > len(buf) or _frame(buf, i + hdr[0])):
            first = i
            break
    if first is None:
        return None
    _length, rate, _kbps, per_frame, mono = _frame(buf, first)
    side = (17 if mono else 32) if per_frame == 1152 else (9 if mono else 17)
    xing = buf[first + 4 + side : first + 4 + side + 12]
    if xing[:4] in (b"Xing", b"Info") and struct.unpack(">I", xing[4:8])[0] & 1:
        return struct.unpack(">I", xing[8:12])[0] * per_frame / rate
    if buf[first + 36 : first + 40] == b"VBRI":
        return struct.unpack(">I", buf[first + 50 : first + 54])[0] * per_frame / rate
    # 머리말이 없으면 앞쪽 프레임(최대 300개)의 평균 비트레이트로 (가변 비트레이트도 크게 틀리지 않게)
    rates, i = [], first
    while len(rates) < 300:
        hdr = _frame(buf, i)
        if not hdr:
            break
        rates.append(hdr[2])
        i += hdr[0]
    audio = size - start - first
    f.seek(max(0, size - 128))
    if f.read(3) == b"TAG":
        audio -= 128
    return audio * 8 / (sum(rates) / len(rates) * 1000)
