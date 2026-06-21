"""
/songs/*/song.json 을 스캔해 /songs/manifest.json 을 생성한다.
새 곡을 추가한 뒤 이 스크립트를 다시 실행해야 웹앱이 그 곡을 찾을 수 있다.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SONGS_DIR = ROOT / "songs"


def main() -> None:
    entries = []
    for song_json_path in sorted(SONGS_DIR.glob("*/song.json")):
        song = json.loads(song_json_path.read_text(encoding="utf-8"))
        entries.append(
            {
                "title": song["title"],
                "path": f"{song_json_path.parent.name}/song.json",
            }
        )

    manifest = {"songs": entries}
    out_path = SONGS_DIR / "manifest.json"
    out_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"wrote {out_path} ({len(entries)} songs)")


if __name__ == "__main__":
    main()
