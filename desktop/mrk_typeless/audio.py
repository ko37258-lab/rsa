"""마이크 녹음 → WAV 바이트."""

import io
import threading
import time
import wave

SAMPLE_RATE = 16_000


class AudioError(Exception):
    pass


class Recorder:
    def __init__(self) -> None:
        self._frames: list = []
        self._stream = None
        self._lock = threading.Lock()
        self.started_at = 0.0
        self.level = 0.0  # 0~1, 말소리 크기 (화면 표시용)

    @property
    def recording(self) -> bool:
        return self._stream is not None

    def start(self) -> None:
        import numpy as np
        import sounddevice as sd

        def callback(indata, _frames, _time, _status):
            with self._lock:
                self._frames.append(indata.copy())
            rms = float(np.sqrt(np.mean(np.square(indata.astype(np.float32) / 32768.0))))
            self.level = min(1.0, rms * 8)

        self._frames = []
        stream = None
        try:
            stream = sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="int16", callback=callback)
            stream.start()
        except Exception as e:  # 마이크 없음·권한 없음 등
            if stream is not None:
                try:
                    stream.close()  # 열어 둔 채 버리면 마이크가 계속 '사용 중'으로 남습니다
                except Exception:
                    pass
            raise AudioError("마이크를 열지 못했습니다. 마이크 연결과 Windows 개인정보 설정(마이크 허용)을 확인해 주세요.") from e
        self._stream = stream
        self.started_at = time.monotonic()

    def stop(self) -> tuple[bytes, float]:
        """녹음을 멈추고 (WAV 바이트, 말한 초)를 돌려줍니다."""
        import numpy as np

        stream, self._stream = self._stream, None
        if stream is None:
            return b"", 0.0
        try:
            stream.stop()
            stream.close()
        finally:
            self.level = 0.0
        seconds = time.monotonic() - self.started_at
        with self._lock:
            frames, self._frames = self._frames, []
        if not frames:
            return b"", seconds
        samples = np.concatenate(frames)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SAMPLE_RATE)
            w.writeframes(samples.tobytes())
        return buf.getvalue(), seconds

    def cancel(self) -> None:
        stream, self._stream = self._stream, None
        if stream is not None:
            try:
                stream.stop()
                stream.close()
            except Exception:
                pass
        self._frames = []
        self.level = 0.0
