import { createSongLibrary } from "./songLibrary.js";
import { buildSetlist } from "./pptxMerge.js";
import { buildSongFromUpload } from "./songUpload.js";
import { commitNewSong, TOKEN_STORAGE_KEY } from "./githubCommit.js";

const songLibrary = createSongLibrary({ JSZip: window.JSZip });

const availableEl = document.getElementById("availableSongs");
const paginationEl = document.getElementById("pagination");
const searchInput = document.getElementById("songSearch");
const contiEl = document.getElementById("contiList");
const statusEl = document.getElementById("status");
const generateBtn = document.getElementById("generate");

const PAGE_SIZE = 10;
let allSongs = []; // songLibrary.listSongs()의 전체 결과
let currentPage = 1;

const songTitleInput = document.getElementById("songTitle");
const songFileInput = document.getElementById("songFile");
const githubTokenInput = document.getElementById("githubToken");
const rememberTokenCheckbox = document.getElementById("rememberToken");
const uploadBtn = document.getElementById("uploadSong");
const uploadStatusEl = document.getElementById("uploadStatus");

let contiTitles = []; // 사용자가 구성한 콘티 순서

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = kind || "";
}

function todayDateString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

// ---- 왼쪽: 등록된 곡 목록 (검색 + 페이지네이션) ----

function getFilteredSongs() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return allSongs;
  return allSongs.filter((song) => song.title.toLowerCase().includes(query));
}

function renderAvailableSongsView() {
  const filtered = getFilteredSongs();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageSongs = filtered.slice(start, start + PAGE_SIZE);

  renderAvailableSongs(pageSongs, filtered.length);
  renderPagination(totalPages);
}

function renderAvailableSongs(songs, totalCount) {
  availableEl.innerHTML = "";
  if (totalCount === 0) {
    availableEl.innerHTML = '<div class="empty-hint">검색 결과가 없습니다</div>';
    return;
  }
  for (const song of songs) {
    const card = document.createElement("div");
    card.className = "song-card";
    card.draggable = true;
    card.dataset.title = song.title;
    card.textContent = song.title;

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("application/x-song-source", "available");
      e.dataTransfer.setData("text/plain", song.title);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));

    // 드래그 없이도 클릭으로 콘티 맨 끝에 추가 가능
    card.addEventListener("click", () => {
      contiTitles.push(song.title);
      renderConti();
    });

    availableEl.appendChild(card);
  }
}

function renderPagination(totalPages) {
  paginationEl.innerHTML = "";
  if (totalPages <= 1) return;

  for (let page = 1; page <= totalPages; page++) {
    const btn = document.createElement("button");
    btn.textContent = String(page);
    btn.className = page === currentPage ? "active" : "";
    btn.addEventListener("click", () => {
      currentPage = page;
      renderAvailableSongsView();
    });
    paginationEl.appendChild(btn);
  }
}

searchInput.addEventListener("input", () => {
  currentPage = 1;
  renderAvailableSongsView();
});

// ---- 오른쪽: 콘티 순서 ----

function renderConti() {
  contiEl.innerHTML = "";
  if (contiTitles.length === 0) {
    contiEl.innerHTML = '<div class="empty-hint">왼쪽에서 곡을 드래그하거나 클릭해서 추가하세요</div>';
    return;
  }

  contiTitles.forEach((title, index) => {
    const card = document.createElement("div");
    card.className = "song-card";
    card.draggable = true;
    card.dataset.index = String(index);

    const orderNum = document.createElement("span");
    orderNum.className = "order-num";
    orderNum.textContent = `${index + 1}.`;

    const titleSpan = document.createElement("span");
    titleSpan.className = "title";
    titleSpan.textContent = title;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "×";
    removeBtn.title = "제거";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      contiTitles.splice(index, 1);
      renderConti();
    });

    card.append(orderNum, titleSpan, removeBtn);

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("application/x-song-source", "conti");
      e.dataTransfer.setData("application/x-conti-index", String(index));
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));

    contiEl.appendChild(card);
  });
}

function getDragAfterElement(container, y) {
  const cards = [...container.querySelectorAll(".song-card:not(.dragging)")];
  return cards.reduce(
    (closest, child) => {
      const rect = child.getBoundingClientRect();
      const offset = y - rect.top - rect.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

contiEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  contiEl.classList.add("drag-over");
});
contiEl.addEventListener("dragleave", () => contiEl.classList.remove("drag-over"));

contiEl.addEventListener("drop", (e) => {
  e.preventDefault();
  contiEl.classList.remove("drag-over");

  const source = e.dataTransfer.getData("application/x-song-source");
  const afterElement = getDragAfterElement(contiEl, e.clientY);
  const insertIndex =
    afterElement == null
      ? contiTitles.length
      : parseInt(afterElement.dataset.index, 10);

  if (source === "available") {
    const title = e.dataTransfer.getData("text/plain");
    contiTitles.splice(insertIndex, 0, title);
  } else if (source === "conti") {
    const fromIndex = parseInt(e.dataTransfer.getData("application/x-conti-index"), 10);
    const [moved] = contiTitles.splice(fromIndex, 1);
    const adjustedIndex = fromIndex < insertIndex ? insertIndex - 1 : insertIndex;
    contiTitles.splice(adjustedIndex, 0, moved);
  }

  renderConti();
});

// ---- 다운로드 ----

generateBtn.addEventListener("click", async () => {
  if (contiTitles.length === 0) {
    setStatus("콘티에 곡을 먼저 추가해주세요.", "error");
    return;
  }

  generateBtn.disabled = true;
  setStatus("콘티를 생성하는 중...");

  try {
    const blob = await buildSetlist(contiTitles, songLibrary, window.JSZip);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `콘티_${todayDateString()}.pptx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(`완료! ${contiTitles.length}곡을 합쳐 콘티를 다운로드했습니다.`, "success");
  } catch (err) {
    setStatus("오류: " + err.message, "error");
  } finally {
    generateBtn.disabled = false;
  }
});

// ---- 새 가사 등록 ----

function setUploadStatus(message, kind) {
  uploadStatusEl.textContent = message;
  uploadStatusEl.className = kind || "";
}

const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
if (savedToken) {
  githubTokenInput.value = savedToken;
  rememberTokenCheckbox.checked = true;
}

uploadBtn.addEventListener("click", async () => {
  const title = songTitleInput.value.trim();
  const file = songFileInput.files[0];
  const token = githubTokenInput.value.trim();

  if (!title) {
    setUploadStatus("곡 제목을 입력해주세요.", "error");
    return;
  }
  if (!file) {
    setUploadStatus("pptx 파일을 선택해주세요.", "error");
    return;
  }
  if (!token) {
    setUploadStatus("GitHub Token을 입력해주세요.", "error");
    return;
  }

  uploadBtn.disabled = true;
  setUploadStatus("업로드하는 중...");

  try {
    if (rememberTokenCheckbox.checked) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }

    const existing = await songLibrary.findSongByTitle(title);
    if (existing) {
      throw new Error(`이미 등록된 제목입니다: "${title}"`);
    }

    const fileBuffer = await file.arrayBuffer();
    const { songJson, pptxArrayBuffer } = await buildSongFromUpload(
      fileBuffer,
      title,
      window.JSZip
    );

    const { slug } = await commitNewSong({ songJson, pptxArrayBuffer, token });

    setUploadStatus(
      `완료! "${title}"을 ${slug}로 등록했습니다. GitHub Pages가 다시 배포되는 데 1~2분 ` +
        `걸리니, 잠시 후 페이지를 새로고침하면 왼쪽 목록에 나타납니다.`,
      "success"
    );
    songTitleInput.value = "";
    songFileInput.value = "";
    songLibrary.reset();
  } catch (err) {
    setUploadStatus("오류: " + err.message, "error");
  } finally {
    uploadBtn.disabled = false;
  }
});

// ---- 초기화 ----

async function init() {
  renderConti();
  try {
    allSongs = await songLibrary.listSongs();
    renderAvailableSongsView();
  } catch (err) {
    availableEl.innerHTML = `<div class="empty-hint">곡 목록을 불러오지 못했습니다: ${err.message}</div>`;
  }
}

init();
