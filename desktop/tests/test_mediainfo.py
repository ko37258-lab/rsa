"""녹음 파일 길이 읽기 (ffmpeg 없이 파일 머리만): wav · m4a/mp4/mov · flac · mp3"""

import struct
import wave

import pytest

from mrk_typeless.mediainfo import duration_seconds


def box(kind: bytes, body: bytes) -> bytes:
    return struct.pack(">I", 8 + len(body)) + kind + body


def mvhd(timescale: int, duration: int, version: int = 0) -> bytes:
    if version == 1:
        return box(b"mvhd", bytes([1, 0, 0, 0]) + b"\0" * 16 + struct.pack(">IQ", timescale, duration) + b"\0" * 80)
    return box(b"mvhd", bytes(4) + b"\0" * 8 + struct.pack(">II", timescale, duration) + b"\0" * 80)


def test_wav(tmp_path):
    p = tmp_path / "a.wav"
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"\0\0" * 16000 * 3)
    assert duration_seconds(str(p)) == pytest.approx(3.0)


def test_wav_cut_off_while_recording(tmp_path):
    """녹음 중에 끊겨 data 크기 칸이 0인 wav도 실제 크기로 계산합니다."""
    fmt = struct.pack("<HHIIHH", 1, 1, 8000, 16000, 2, 16)
    body = b"WAVE" + b"fmt " + struct.pack("<I", 16) + fmt + b"data" + struct.pack("<I", 0) + b"\0" * 32000
    p = tmp_path / "cut.wav"
    p.write_bytes(b"RIFF" + struct.pack("<I", 0) + body)
    assert duration_seconds(str(p)) == pytest.approx(2.0)


def test_m4a_with_moov_after_media(tmp_path):
    """휴대폰 녹음(m4a)은 moov가 파일 끝에 있는 경우가 많습니다."""
    data = box(b"ftyp", b"M4A \0\0\0\0isomM4A ") + box(b"mdat", b"\0" * 5000) + box(b"moov", mvhd(44100, 44100 * 2700) + box(b"trak", b"\0" * 20))
    p = tmp_path / "녹음.m4a"
    p.write_bytes(data)
    assert duration_seconds(str(p)) == pytest.approx(2700)


def test_mov_with_64bit_box_and_version1_header(tmp_path):
    big = struct.pack(">I", 1) + b"mdat" + struct.pack(">Q", 16 + 100) + b"\0" * 100
    data = box(b"ftyp", b"qt  \0\0\0\0qt  ") + big + box(b"moov", mvhd(600, 600 * 75 * 60, version=1))
    p = tmp_path / "강의.mov"
    p.write_bytes(data)
    assert duration_seconds(str(p)) == pytest.approx(75 * 60)


def test_flac(tmp_path):
    rate, samples = 44100, 44100 * 600
    info = bytearray(34)
    info[10] = (rate >> 12) & 0xFF
    info[11] = (rate >> 4) & 0xFF
    info[12] = ((rate & 0xF) << 4) | (1 << 1)  # 채널·비트 수 일부
    info[13] = (samples >> 32) & 0x0F
    info[14:18] = struct.pack(">I", samples & 0xFFFFFFFF)
    p = tmp_path / "a.flac"
    p.write_bytes(b"fLaC" + bytes([0x80, 0, 0, 34]) + bytes(info) + b"\0" * 100)
    assert duration_seconds(str(p)) == pytest.approx(600)


def mp3_frame_header(kbps_index: int = 9) -> bytes:
    # MPEG1 Layer III, 보호 없음, 128kbps(9), 44.1kHz(0), 스테레오
    return bytes([0xFF, 0xFB, (kbps_index << 4) | 0x00, 0x00])


FRAME_LEN = 144000 * 128 // 44100  # 128kbps·44.1kHz 프레임 길이 (417바이트)


def mp3_frames(n: int, first: bytes = b"") -> bytes:
    frame = mp3_frame_header() + b"\0" * (FRAME_LEN - 4)
    head = (first + frame)[:FRAME_LEN] if first else frame
    return head + frame * (n - 1)


def test_mp3_vbr_reads_xing_frame_count(tmp_path):
    frames = 44100 * 90 // 1152  # 약 90초
    xing = mp3_frame_header() + b"\0" * 32 + b"Xing" + struct.pack(">II", 1, frames)
    id3 = b"ID3" + bytes([4, 0, 0]) + bytes([0, 0, 0, 20]) + b"\0" * 20
    p = tmp_path / "강의.mp3"
    p.write_bytes(id3 + mp3_frames(10, first=xing))
    assert duration_seconds(str(p)) == pytest.approx(frames * 1152 / 44100)


def test_mp3_cbr_uses_size_and_bitrate(tmp_path):
    n = round(120 * 44100 / 1152)
    p = tmp_path / "cbr.mp3"
    p.write_bytes(mp3_frames(n))
    assert duration_seconds(str(p)) == pytest.approx(120, rel=0.01)


def test_aac_adts_is_not_read_as_mp3(tmp_path):
    """.aac(ADTS)는 FF F1로 시작해 mp3 머리처럼 보이지만 mp3로 읽지 않습니다 (Gemini에 올린 뒤 계산)."""
    import random

    rng = random.Random(7)
    payload = bytes(rng.randrange(256) for _ in range(200_000))
    p = tmp_path / "녹음.aac"
    p.write_bytes(bytes([0xFF, 0xF1, 0x50, 0x80]) + payload)
    assert duration_seconds(str(p)) is None
    q = tmp_path / "가짜.mp3"  # 우연히 프레임 머리처럼 보이는 바이트만 있고 다음 프레임이 없음
    q.write_bytes(b"\0" * 100 + mp3_frame_header() + payload[:5000])
    assert duration_seconds(str(q)) is None


def test_flac_with_id3_tag(tmp_path):
    rate, samples = 48000, 48000 * 300
    info = bytearray(34)
    info[10] = (rate >> 12) & 0xFF
    info[11] = (rate >> 4) & 0xFF
    info[12] = (rate & 0xF) << 4
    info[14:18] = struct.pack(">I", samples)
    id3 = b"ID3" + bytes([4, 0, 0]) + bytes([0, 0, 0, 30]) + b"\0" * 30
    p = tmp_path / "태그.flac"
    p.write_bytes(id3 + b"fLaC" + bytes([0x80, 0, 0, 34]) + bytes(info))
    assert duration_seconds(str(p)) == pytest.approx(300)


@pytest.mark.parametrize(
    ("name", "data"),
    [("x.m4a", b""), ("x.ogg", b"OggS" + b"\0" * 100), ("x.webm", b"\x1a\x45\xdf\xa3" + b"\0" * 50), ("x.wav", b"RIFF\0\0\0\0WAVE")],
)
def test_unknown_or_broken_files_give_none(tmp_path, name, data):
    p = tmp_path / name
    p.write_bytes(data)
    assert duration_seconds(str(p)) is None


def test_missing_file_gives_none(tmp_path):
    assert duration_seconds(str(tmp_path / "없는 파일.m4a")) is None
