import { createSongLibrary } from "./songLibrary.js";
import { buildSetlist } from "./pptxMerge.js";

const songLibrary = createSongLibrary({ JSZip: window.JSZip });

const titlesEl = document.getElementById("titles");
const statusEl = document.getElementById("status");
const songListEl = document.getElementById("songList");
const generateBtn = document.getElementById("generate");

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = kind || "";
}

async function showAvailableSongs() {
  try {
    const manifest = await songLibrary.fetchManifest();
    songListEl.textContent =
      "등록된 곡 목록: " + manifest.songs.map((s) => s.title).join(" / ");
  } catch (err) {
    songListEl.textContent = "곡 목록을 불러오지 못했습니다: " + err.message;
  }
}

function todayDateString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

generateBtn.addEventListener("click", async () => {
  const titles = titlesEl.value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (titles.length === 0) {
    setStatus("곡 제목을 한 줄에 하나씩 입력해주세요.", "error");
    return;
  }

  generateBtn.disabled = true;
  setStatus("콘티를 생성하는 중...");

  try {
    const blob = await buildSetlist(titles, songLibrary, window.JSZip);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `콘티_${todayDateString()}.pptx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(`완료! ${titles.length}곡을 합쳐 콘티를 다운로드했습니다.`, "success");
  } catch (err) {
    setStatus("오류: " + err.message, "error");
  } finally {
    generateBtn.disabled = false;
  }
});

showAvailableSongs();
