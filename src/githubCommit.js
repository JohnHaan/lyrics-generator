// GitHub REST(Git Data) API를 브라우저에서 직접 호출해 새 곡 파일들을
// 한 번의 커밋으로 main 브랜치에 추가한다. 백엔드가 없으므로 사용자가
// 직접 입력한 Personal Access Token(repo 쓰기 권한)으로 인증한다.
//
// 주의: 토큰은 이 브라우저 안에만 존재하고(로컬 저장 선택 시 localStorage),
// 서버로 전송되지 않는다 — 다만 공유 컴퓨터에서는 "토큰 저장"을 끄는 것을 권장.

const OWNER = "JohnHaan";
const REPO = "lyrics-generator";
const BRANCH = "main";
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;

export const TOKEN_STORAGE_KEY = "lyrics-generator:github-token";

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function githubApi(path, token, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API 오류 (${res.status} ${path}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function getManifest(token) {
  const data = await githubApi(`/contents/songs/manifest.json?ref=${BRANCH}`, token);
  const text = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))));
  return JSON.parse(text);
}

function nextSongSlug(manifest) {
  let maxN = 0;
  for (const path of manifest.songs) {
    const m = /^song-(\d+)\//.exec(path);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  }
  return `song-${String(maxN + 1).padStart(2, "0")}`;
}

/**
 * 새 곡(song.pptx + song.json)을 songs/<slug>/ 에 추가하고, manifest.json에
 * 등록한 뒤, 한 번의 커밋으로 main에 올린다.
 *
 * songJson: songUpload.js가 만든 메타데이터
 * pptxArrayBuffer: songUpload.js가 만든 song.pptx 바이트
 * token: 사용자가 입력한 GitHub Personal Access Token (repo 쓰기 권한 필요)
 */
export async function commitNewSong({ songJson, pptxArrayBuffer, token }) {
  const manifest = await getManifest(token);
  const isValidManifest =
    Array.isArray(manifest.songs) && manifest.songs.every((p) => p.endsWith("/song.json"));
  if (!isValidManifest) {
    // manifest 형식이 예상과 다르면 더 진행하지 않고 안전하게 중단
    throw new Error("manifest.json 형식을 인식할 수 없습니다");
  }

  const slug = nextSongSlug(manifest);
  manifest.songs.push(`${slug}/song.json`);
  manifest.songs.sort();

  const ref = await githubApi(`/git/ref/heads/${BRANCH}`, token);
  const latestCommitSha = ref.object.sha;

  const latestCommit = await githubApi(`/git/commits/${latestCommitSha}`, token);
  const baseTreeSha = latestCommit.tree.sha;

  const [pptxBlob, songJsonBlob, manifestBlob] = await Promise.all([
    githubApi(`/git/blobs`, token, {
      method: "POST",
      body: JSON.stringify({
        content: arrayBufferToBase64(pptxArrayBuffer),
        encoding: "base64",
      }),
    }),
    githubApi(`/git/blobs`, token, {
      method: "POST",
      body: JSON.stringify({
        content: JSON.stringify(songJson, null, 2),
        encoding: "utf-8",
      }),
    }),
    githubApi(`/git/blobs`, token, {
      method: "POST",
      body: JSON.stringify({
        content: JSON.stringify(manifest, null, 2),
        encoding: "utf-8",
      }),
    }),
  ]);

  const newTree = await githubApi(`/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [
        { path: `songs/${slug}/song.pptx`, mode: "100644", type: "blob", sha: pptxBlob.sha },
        { path: `songs/${slug}/song.json`, mode: "100644", type: "blob", sha: songJsonBlob.sha },
        { path: "songs/manifest.json", mode: "100644", type: "blob", sha: manifestBlob.sha },
      ],
    }),
  });

  const newCommit = await githubApi(`/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({
      message: `새 곡 추가: ${songJson.title}`,
      tree: newTree.sha,
      parents: [latestCommitSha],
    }),
  });

  await githubApi(`/git/refs/heads/${BRANCH}`, token, {
    method: "PATCH",
    body: JSON.stringify({ sha: newCommit.sha }),
  });

  return { slug, commitSha: newCommit.sha };
}

/** 업로드 전에 같은 제목의 곡이 이미 있는지 확인 (실수로 중복 등록 방지) */
export async function titleAlreadyExists(title, songLibrary) {
  const existing = await songLibrary.findSongByTitle(title);
  return existing != null;
}
