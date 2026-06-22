"""
업로드 양식 안내용 샘플 pptx(/template/sample.pptx)를 생성한다.
실제 곡과 똑같은 스타일(폰트 휴먼모음T, 제목=노란 96pt, 가사=흰 72pt, 가운데정렬)로
슬라이드 3장(제목 1장 + 가사 2장)을 만들어, 사용자가 이 파일을 열어 텍스트만
바꿔서 자신의 곡을 만들 수 있게 한다.

업로드 규칙: 슬라이드 순서 그대로가 곡의 재생 순서가 된다 (반복 구간이
필요하면 업로드 후 GitHub에서 song.json의 order[]를 직접 수정).
"""
from pathlib import Path

from ooxml_utils import build_song_pptx, lyric_slide, title_slide

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "template" / "blank.pptx"
OUTPUT = ROOT / "template" / "sample.pptx"


def main() -> None:
    slides = [
        title_slide("[샘플] 새 찬양 제목"),
        lyric_slide("1절", ["첫 번째 가사 줄", "두 번째 가사 줄", "세 번째 가사 줄"]),
        lyric_slide("후렴", ["후렴 가사 줄 하나", "후렴 가사 줄 둘"]),
    ]

    pptx_bytes = build_song_pptx(TEMPLATE, slides)
    OUTPUT.write_bytes(pptx_bytes)
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
