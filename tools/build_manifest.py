"""
/songs/*/song.json 을 스캔해 /songs/manifest.json 을 생성한다.
manifest는 곡 폴더의 song.json 경로 목록만 가진다 (title은 일부러 넣지 않음) —
표시용 제목은 항상 런타임에 각 song.json에서 직접 읽어서, manifest가 stale해져도
화면에 보이는 제목이 실제 데이터와 어긋나는 일이 없게 한다.
새 곡을 추가한 뒤 이 스크립트를 다시 실행해야 웹앱이 그 곡을 찾을 수 있다.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SONGS_DIR = ROOT / "songs"


def main() -> None:
    paths = [
        f"{song_json_path.parent.name}/song.json"
        for song_json_path in sorted(SONGS_DIR.glob("*/song.json"))
    ]

    manifest = {"songs": paths}
    out_path = SONGS_DIR / "manifest.json"
    out_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"wrote {out_path} ({len(paths)} songs)")


if __name__ == "__main__":
    main()
