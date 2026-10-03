#!/usr/bin/env python3
"""Check (and with --install, install) everything the skill needs.
  python setup_check.py            # 점검만
  python setup_check.py --install  # 없는 것 자동 설치
"""
import importlib, subprocess, sys

PKGS = [('numpy', 'numpy'), ('imageio_ffmpeg', 'imageio-ffmpeg'), ('playwright', 'playwright'), ('faster_whisper', 'faster-whisper')]


def main():
    install = '--install' in sys.argv
    if sys.version_info < (3, 9):
        print('✗ Python 3.9 이상이 필요합니다. https://www.python.org/downloads/ 에서 설치하세요.'); sys.exit(1)
    missing = []
    for mod, pip in PKGS:
        try:
            importlib.import_module(mod); print(f'✓ {pip}')
        except ImportError:
            print(f'✗ {pip} 없음'); missing.append(pip)
    if missing and install:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--upgrade'] + missing)
        missing = []
    if missing:
        print('\n→ python setup_check.py --install 로 설치하세요.'); sys.exit(1)
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            p.chromium.launch().close()
        print('✓ Chromium (화면 합성용 브라우저)')
    except Exception as e:
        if install:
            subprocess.check_call([sys.executable, '-m', 'playwright', 'install', 'chromium']); print('✓ Chromium 설치 완료')
        else:
            print('✗ Chromium 없음 →  python -m playwright install chromium', e); sys.exit(1)
    sys.path.insert(0, __import__('os').path.dirname(__file__))
    from common import FF
    print('✓ ffmpeg:', FF)
    print('\n준비 완료!')


if __name__ == '__main__':
    main()
