"""
1회성 마이그레이션 스크립트: 기존 예시 콘티(260619 금요예배찬양.pptx, 50슬라이드/5곡)를
/songs/song-XX/song.pptx + song.json 으로 분리한다.

곡 경계와 섹션 반복 구조는 사람이 직접 슬라이드별 가사를 읽고 분석해 SONGS에
명시적으로 적어두었다 (자동 추정이 아님 — 자동 추정은 라벨이 같아도 가사가 다른
경우(4번 곡 A1/A1b 등)를 놓칠 위험이 크다고 판단). 이 스크립트는 그 분석을
기계적으로 실행하고, 마지막에 재구성한 전체 시퀀스가 원본 50슬라이드와
텍스트 단위로 정확히 일치하는지 검증한다.
"""
import json
import zipfile
from pathlib import Path

from ooxml_utils import build_song_pptx, extract_text, resolve_slide_order

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "260619 금요예배찬양.pptx"
TEMPLATE = ROOT / "template" / "blank.pptx"
SONGS_DIR = ROOT / "songs"

# 각 곡: title, 원본 슬라이드 순서상의 1-based 범위(inclusive),
# 그 범위 안에서 슬라이드마다 부여할 key의 시퀀스(반복 포함, 길이는 범위와 같아야 함).
# 같은 라벨이라도 가사가 다르면 다른 key를 부여한다 (예: A1 / A1b).
SONGS = [
    {
        "title": "함께 지어져 가네",
        "slug": "song-01",
        "range": (1, 10),
        "keys": ["title", "A1", "A2", "B1", "B2", "interlude", "A1", "A2", "B1", "B2"],
    },
    {
        "title": "생명 주께 있네 + 멈출 수 없네",
        "slug": "song-02",
        "range": (11, 22),
        "keys": ["title", "A", "B", "A", "B", "A_outro", "C1", "C2", "D", "E", "D", "E"],
    },
    {
        "title": "실로암",
        "slug": "song-03",
        "range": (23, 30),
        "keys": ["title", "A1", "A2", "B", "interlude", "A1", "A2", "B"],
    },
    {
        "title": "나는 주를 섬기는 것에 + 이것이 나의 간증이요",
        "slug": "song-04",
        "range": (31, 42),
        "keys": ["title", "A1", "A1b", "A2", "A2b", "B1", "B2", "A2", "A2b", "B1", "B2", "C"],
    },
    {
        "title": "예수 나를 오라 하네",
        "slug": "song-05",
        "range": (43, 50),
        "keys": ["title", "A1", "B1", "A2", "B1", "C", "D", "closing"],
    },
]


def main() -> None:
    with zipfile.ZipFile(SOURCE) as zf:
        ordered_paths = resolve_slide_order(zf)
        assert len(ordered_paths) == 50, f"expected 50 slides, got {len(ordered_paths)}"
        all_slide_xml = [zf.read(p).decode("utf-8") for p in ordered_paths]

    original_texts = [extract_text(x) for x in all_slide_xml]

    reconstructed_texts: list[str] = []
    SONGS_DIR.mkdir(exist_ok=True)

    for song in SONGS:
        start, end = song["range"]
        n = end - start + 1
        assert len(song["keys"]) == n, (
            f"{song['title']}: keys length {len(song['keys'])} != range length {n}"
        )

        song_slide_xmls = all_slide_xml[start - 1 : end]
        song_texts = original_texts[start - 1 : end]

        # key -> 이 곡 안에서 첫 등장한 0-based index (song.pptx에 실제로 저장될 위치)
        unique_index_by_key: dict[str, int] = {}
        unique_slide_xmls: list[str] = []
        for key, xml in zip(song["keys"], song_slide_xmls):
            if key not in unique_index_by_key:
                unique_index_by_key[key] = len(unique_slide_xmls)
                unique_slide_xmls.append(xml)

        # 같은 key로 다시 등장한 슬라이드가 실제로 동일한 가사 텍스트인지 검증
        # (다르면 segmentation 분석이 잘못된 것이므로 바로 에러를 내야 함)
        text_by_key: dict[str, str] = {}
        for key, text in zip(song["keys"], song_texts):
            if key in text_by_key:
                assert text_by_key[key] == text, (
                    f"{song['title']}: key '{key}' repeats with different text!\n"
                    f"first: {text_by_key[key]!r}\nnow:   {text!r}"
                )
            else:
                text_by_key[key] = text

        reconstructed_texts.extend(text_by_key[key] for key in song["keys"])

        out_dir = SONGS_DIR / song["slug"]
        out_dir.mkdir(exist_ok=True)

        pptx_bytes = build_song_pptx(TEMPLATE, unique_slide_xmls)
        (out_dir / "song.pptx").write_bytes(pptx_bytes)

        song_json = {
            "title": song["title"],
            "sourceFile": "song.pptx",
            "slides": [
                {"key": key, "index": index, "label": key}
                for key, index in unique_index_by_key.items()
            ],
            "order": song["keys"],
        }
        (out_dir / "song.json").write_text(
            json.dumps(song_json, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        print(f"{song['slug']}: {len(unique_slide_xmls)} unique slides, {n} in order")

    assert reconstructed_texts == original_texts, (
        "재구성한 50슬라이드 텍스트 시퀀스가 원본과 다릅니다 — segmentation 분석을 다시 확인하세요."
    )
    print("OK: 5곡을 원래 순서로 합치면 원본 50슬라이드 텍스트와 정확히 일치함")


if __name__ == "__main__":
    main()
