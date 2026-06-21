// /songs/manifest.json은 곡 폴더 경로 목록만 가지고 있고, 표시용 제목은 항상
// 각 곡의 song.json에서 직접 읽어온다 (manifest에 title을 따로 캐싱해두면
// song.json을 고쳐도 manifest를 재생성하기 전까지 화면과 실제 데이터가
//어긋날 수 있어서, 그 어긋남 자체를 구조적으로 없앤다).

export function createSongLibrary({ JSZip, baseUrl = "songs/" } = {}) {
  let manifestPromise = null;
  let songsPromise = null; // [{ title, path }] - song.json을 직접 읽어 만든 목록
  const songJsonCache = new Map(); // path -> Promise<songJson>
  const loadedSongCache = new Map(); // title -> Promise<{ songJson, zip }>

  function resolveUrl(path) {
    return new URL(path, new URL(baseUrl, document.baseURI));
  }

  async function fetchJson(url, errorMessage) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(errorMessage);
    return res.json();
  }

  async function fetchManifest() {
    if (!manifestPromise) {
      manifestPromise = fetchJson(
        resolveUrl("manifest.json"),
        "곡 목록(manifest.json)을 불러오지 못했습니다"
      );
    }
    return manifestPromise;
  }

  function fetchSongJson(path) {
    if (!songJsonCache.has(path)) {
      songJsonCache.set(
        path,
        fetchJson(resolveUrl(path), `"${path}"의 song.json을 불러오지 못했습니다`)
      );
    }
    return songJsonCache.get(path);
  }

  /** 등록된 곡 목록을 [{ title, path }] 형태로 반환한다. title은 매 호출마다
   * song.json에서 새로 읽으므로 항상 실제 데이터와 일치한다. */
  async function listSongs() {
    if (!songsPromise) {
      songsPromise = (async () => {
        const manifest = await fetchManifest();
        return Promise.all(
          manifest.songs.map(async (path) => {
            const songJson = await fetchSongJson(path);
            return { title: songJson.title, path };
          })
        );
      })();
    }
    return songsPromise;
  }

  async function findSongByTitle(title) {
    const songs = await listSongs();
    return songs.find((s) => s.title === title) || null;
  }

  async function loadSong(title) {
    if (loadedSongCache.has(title)) {
      return loadedSongCache.get(title);
    }

    const promise = (async () => {
      const ref = await findSongByTitle(title);
      if (!ref) {
        throw new Error(`곡을 찾을 수 없습니다: "${title}"`);
      }

      const songJsonUrl = resolveUrl(ref.path);
      const songJson = await fetchSongJson(ref.path);

      const pptxUrl = new URL(songJson.sourceFile, songJsonUrl);
      const pptxBytes = await fetch(pptxUrl, { cache: "no-cache" }).then((res) => {
        if (!res.ok) throw new Error(`"${title}"의 song.pptx를 불러오지 못했습니다`);
        return res.arrayBuffer();
      });
      const zip = await JSZip.loadAsync(pptxBytes);

      return { songJson, zip };
    })();

    loadedSongCache.set(title, promise);
    return promise;
  }

  /** 새로 커밋한 곡을 바로 목록에 반영하기 위해 캐시를 전부 비운다. */
  function reset() {
    manifestPromise = null;
    songsPromise = null;
    songJsonCache.clear();
    loadedSongCache.clear();
  }

  return { fetchManifest, listSongs, findSongByTitle, loadSong, reset };
}
