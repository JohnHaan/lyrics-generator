import { createSongLibrary } from "./songLibrary.js";
import { buildSetlist } from "./pptxMerge.js";

const songLibrary = createSongLibrary({ JSZip: window.JSZip });

const availableEl = document.getElementById("availableSongs");
const contiEl = document.getElementById("contiList");
const statusEl = document.getElementById("status");
const generateBtn = document.getElementById("generate");

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

// ---- 왼쪽: 등록된 곡 목록 ----

function renderAvailableSongs(songs) {
  availableEl.innerHTML = "";
  if (songs.length === 0) {
    availableEl.innerHTML = '<div class="empty-hint">등록된 곡이 없습니다</div>';
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

// ---- 초기화 ----

async function init() {
  renderConti();
  try {
    const songs = await songLibrary.listSongs();
    renderAvailableSongs(songs);
  } catch (err) {
    availableEl.innerHTML = `<div class="empty-hint">곡 목록을 불러오지 못했습니다: ${err.message}</div>`;
  }
}

init();
