"""수강생 배포용 홈페이지 템플릿 ZIP 만들기.

저장소 최상위에서:  python3 tools/build_template_zip.py
결과: downloads/mrhomes-homepage-template.zip
"""
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "homepage"
OUT = ROOT / "downloads" / "mrhomes-homepage-template.zip"
FOLDER = "mrhomes-homepage"  # 압축을 풀면 나오는 폴더 이름 (윈도우 호환을 위해 영문)
SKIP = {"README.md"}

README_TXT = """﻿미스터홈즈 중개사무소 홈페이지 템플릿 (수강생용)

1. guide.html 을 더블클릭해 사용설명서를 먼저 읽어 보세요.
2. index.html 을 더블클릭하면 홈페이지가 열립니다.
3. 내 사무소로 바꾸기: js/config.js (사무소 정보·지도), js/listings.js (매물), images 폴더 (사진)
4. 인터넷에 올리기: https://app.netlify.com/drop 에 이 폴더를 끌어다 놓기

예시로 들어 있는 상호·연락처·이력·매물은 미스터홈즈 서초 부동산의 것입니다.
올리기 전에 반드시 내 정보로 모두 바꿔 주세요.
"""


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in SRC.rglob("*") if p.is_file() and p.name not in SKIP and not p.name.startswith("."))
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{FOLDER}/README.txt", README_TXT)
        for p in files:
            z.write(p, f"{FOLDER}/{p.relative_to(SRC).as_posix()}")
    print(f"{OUT.relative_to(ROOT)}  {OUT.stat().st_size / 1024 / 1024:.2f} MB, {len(files) + 1} files")


if __name__ == "__main__":
    main()
