"""
/raw/ 에 추가된 새 가사 pptx 5개를 분석해서 /songs/song-06~10/ 으로 등록한다.
곡 경계/반복 구조는 사람이 직접 슬라이드별 가사를 읽고 분석해 RAW_SONGS에
명시적으로 적어두었다 (자동 추정 아님 — split_source_deck.py와 동일한 방식).

"주를 찾는 모든 자들이"는 제목에 번호 prefix("2. ")가 있어 다른 곡들과
형식을 맞추기 위해 제거했고, 슬라이드 16번은 가사가 Ba와 완전히 같아서
별도 key 없이 Ba로 재사용했다 (자동으로 dedupe됨).
"""
import json
import re
import zipfile
from pathlib import Path

from ooxml_utils import build_song_pptx, extract_text, resolve_slide_order

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "raw"
TEMPLATE = ROOT / "template" / "blank.pptx"
SONGS_DIR = ROOT / "songs"

RAW_SONGS = [
    {
        "file": "주의 친절한 팔에 안기세.pptx",
        "slug": "song-06",
        "title": "주의 친절한 팔에 안기세",
        "keys": ["title", "A1", "B", "A2", "A3", "B"],
    },
    {
        "file": "사랑하는 나의 아버지.pptx",
        "slug": "song-07",
        "title": "사랑하는 나의 아버지",
        "keys": ["title", "A", "B", "A", "B", "C", "C", "B"],
    },
    {
        "file": "내 영혼의 그윽히 깊은 데서.pptx",
        "slug": "song-08",
        "title": "내 영혼의 그윽히 깊은 데서",
        "keys": ["title", "A1", "A2", "B", "A3", "A4", "B"],
    },
    {
        "file": "예수로 사는 인생.pptx",
        "slug": "song-09",
        "title": "예수로 사는 인생",
        "keys": [
            "title", "A1", "Ba", "Bb", "A2",
            "Ba", "Bb", "Ba", "Bb", "Ba", "Bb", "Ba", "Bb",
        ],
    },
    {
        "file": "주를 찾는 모든 자들이.pptx",
        "slug": "song-10",
        "title": "주를 찾는 모든 자들이",
        "keys": [
            "title", "Aa", "Ab", "Aa", "Ab", "Ba", "Bb", "Aa", "Ab",
            "Ba", "Bb", "Ba", "Bb", "Ba", "Bb", "Ca", "Cb",
        ],
        # 제목 슬라이드에서 번호 prefix 런("2.", " ")을 제거
        "strip_title_prefix_runs": 2,
    },
]


def strip_leading_runs(slide_xml: str, n: int) -> str:
    """슬라이드 XML에서 맨 앞 n개의 <a:r>...</a:r> 런을 제거한다."""
    result = slide_xml
    for _ in range(n):
        result = re.sub(r"<a:r>(?:(?!<a:r>).)*?</a:r>", "", result, count=1, flags=re.S)
    return result


def main() -> None:
    for song in RAW_SONGS:
        src_path = RAW_DIR / song["file"]
        with zipfile.ZipFile(src_path) as zf:
            ordered_paths = resolve_slide_order(zf)
            all_slide_xml = [zf.read(p).decode("utf-8") for p in ordered_paths]

        n = len(all_slide_xml)
        assert len(song["keys"]) == n, (
            f"{song['file']}: keys length {len(song['keys'])} != slide count {n}"
        )

        if song.get("strip_title_prefix_runs"):
            all_slide_xml[0] = strip_leading_runs(
                all_slide_xml[0], song["strip_title_prefix_runs"]
            )

        texts = [extract_text(x) for x in all_slide_xml]

        unique_index_by_key: dict[str, int] = {}
        unique_slide_xmls: list[str] = []
        text_by_key: dict[str, str] = {}

        for key, xml, text in zip(song["keys"], all_slide_xml, texts):
            if key not in unique_index_by_key:
                unique_index_by_key[key] = len(unique_slide_xmls)
                unique_slide_xmls.append(xml)
                text_by_key[key] = text
            else:
                assert text_by_key[key] == text, (
                    f"{song['file']}: key '{key}' repeats with different text!\n"
                    f"first: {text_by_key[key]!r}\nnow:   {text!r}"
                )

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

        print(
            f"{song['slug']} ({song['title']}): "
            f"{len(unique_slide_xmls)} unique slides, {n} in order"
        )


if __name__ == "__main__":
    main()
