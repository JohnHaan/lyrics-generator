// /songs/manifest.json을 불러와 제목으로 곡을 찾고, 실제로 콘티에 쓰이는 곡만
// song.json/song.pptx를 지연 로드(+캐시)한다. 제목 매칭은 항상 정확히 일치.

export function createSongLibrary({ JSZip, baseUrl = "songs/" } = {}) {
  let manifestPromise = null;
  const songCache = new Map(); // title -> Promise<{ songJson, zip }>

  function resolveUrl(path) {
    return new URL(path, new URL(baseUrl, document.baseURI));
  }

  async function fetchManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch(resolveUrl("manifest.json")).then((res) => {
        if (!res.ok) throw new Error("곡 목록(manifest.json)을 불러오지 못했습니다");
        return res.json();
      });
    }
    return manifestPromise;
  }

  async function findSongByTitle(title) {
    const manifest = await fetchManifest();
    return manifest.songs.find((s) => s.title === title) || null;
  }

  async function loadSong(title) {
    if (songCache.has(title)) {
      return songCache.get(title);
    }

    const promise = (async () => {
      const ref = await findSongByTitle(title);
      if (!ref) {
        throw new Error(`곡을 찾을 수 없습니다: "${title}"`);
      }

      const songJsonUrl = resolveUrl(ref.path);
      const songJson = await fetch(songJsonUrl).then((res) => {
        if (!res.ok) throw new Error(`"${title}"의 song.json을 불러오지 못했습니다`);
        return res.json();
      });

      const pptxUrl = new URL(songJson.sourceFile, songJsonUrl);
      const pptxBytes = await fetch(pptxUrl).then((res) => {
        if (!res.ok) throw new Error(`"${title}"의 song.pptx를 불러오지 못했습니다`);
        return res.arrayBuffer();
      });
      const zip = await JSZip.loadAsync(pptxBytes);

      return { songJson, zip };
    })();

    songCache.set(title, promise);
    return promise;
  }

  return { fetchManifest, findSongByTitle, loadSong };
}
