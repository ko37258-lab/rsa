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

README_TXT = """\ufeff미스터홈즈 중개사무소 홈페이지 템플릿 (수강생용)

[가장 쉬운 방법 — 코드를 열지 않고 5칸만]
1. ChatGPT 또는 Claude에 이 ZIP 파일을 첨부합니다.
2. gpt-prompt.txt 의 글을 복사해 ○○ 부분만 내 정보로 바꿔 붙여 넣습니다.
3. AI가 돌려준 ZIP을 풀고 index.html 을 열어 확인합니다.
4. https://app.netlify.com/drop 에 mrhomes-homepage 폴더를 끌어다 놓으면 인터넷 주소가 생깁니다.

[직접 고치기]
- js/my-office.js : 명칭·소재지·연락처·등록번호·대표자 5칸 (이것만 채워도 내 홈페이지가 됩니다)
- js/config.js    : 문구·대표 소개·이력·지하철 길 안내 지도 등 자세한 내용
- js/listings.js  : 매물
- images 폴더     : 사진
자세한 설명은 guide.html 을 더블클릭해서 보세요.

예시로 들어 있는 상호·연락처·이력·매물은 미스터홈즈 서초 부동산의 것입니다.
my-office.js 를 채우면 예시 사무소의 이력·지도·문구는 일반 문구로 바뀌고, 예시 매물에는 "예시" 표시가 붙습니다.
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
