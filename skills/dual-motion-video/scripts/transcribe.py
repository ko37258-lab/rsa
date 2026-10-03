#!/usr/bin/env python3
"""Speech-to-text with word timestamps (faster-whisper, runs locally).
  python transcribe.py video.mp4 [--model small|medium|large-v3] [--lang ko]
Writes transcript.json (segments + words) and transcript.txt (읽기용) next to the video.
"""
import argparse, json, os


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('video')
    ap.add_argument('--model', default='medium'); ap.add_argument('--lang', default='ko')
    A = ap.parse_args()
    from faster_whisper import WhisperModel
    print(f'음성 인식 중... (모델 {A.model}, 처음 한 번은 모델 다운로드로 몇 분 걸립니다)')
    m = WhisperModel(A.model, device='auto', compute_type='int8')
    segs, info = m.transcribe(A.video, language=A.lang, word_timestamps=True, vad_filter=True)
    out = []
    for s in segs:
        out.append(dict(start=round(s.start, 2), end=round(s.end, 2), text=s.text.strip(),
                        words=[[w.word.strip(), round(w.start, 2), round(w.end, 2)] for w in (s.words or [])]))
        print(f'  [{s.start:7.2f} → {s.end:7.2f}] {s.text.strip()}')
    d = os.path.dirname(os.path.abspath(A.video))
    json.dump(dict(language=info.language, duration=round(info.duration, 2), segments=out),
              open(os.path.join(d, 'transcript.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(os.path.join(d, 'transcript.txt'), 'w', encoding='utf-8') as f:
        for s in out:
            f.write(f"[{s['start']:7.2f} → {s['end']:7.2f}] {s['text']}\n")
    print(f'완료: {len(out)}문장 → transcript.json / transcript.txt')


if __name__ == '__main__':
    main()
