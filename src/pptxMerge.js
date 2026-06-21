// 브라우저에서 곡별 source pptx의 슬라이드를 골라 하나의 콘티 pptx로 합치는 엔진.
// 백엔드 없이 JSZip만으로 OOXML 파트를 직접 조립한다 (ooxml.js).

import { resolveSlideOrder, fetchTemplateBytes, buildPptxFromSlides } from "./ooxml.js";

/**
 * 한 곡의 song.pptx(JSZip)에서 song.json의 slides[].index가 가리키는
 * 실제 슬라이드 XML 텍스트를 가져온다. 같은 곡 안에서 여러 번 쓰일 수 있으니
 * 곡 단위로 순서 resolve 결과를 캐싱해서 재사용한다.
 */
function makeSlideXmlGetter(zip) {
  let orderedPathsPromise = null;
  return async function getSlideXml(index) {
    if (!orderedPathsPromise) {
      orderedPathsPromise = resolveSlideOrder(zip);
    }
    const orderedPaths = await orderedPathsPromise;
    const path = orderedPaths[index];
    if (!path) {
      throw new Error(`슬라이드 index ${index}를 찾을 수 없습니다`);
    }
    return zip.file(path).async("string");
  };
}

/**
 * songTitlesInOrder: 사용자가 입력한 순서대로의 곡 제목 배열
 * songLibrary: { findSongByTitle(title), loadSong(title) } — songLibrary.js가 제공
 * 반환: 완성된 pptx의 Blob
 */
export async function buildSetlist(songTitlesInOrder, songLibrary, JSZip) {
  const slideXmls = [];

  for (const title of songTitlesInOrder) {
    const songRef = await songLibrary.findSongByTitle(title);
    if (!songRef) {
      throw new Error(`곡을 찾을 수 없습니다: "${title}" (제목이 정확히 일치해야 합니다)`);
    }

    const { songJson, zip: sourceZip } = await songLibrary.loadSong(title);
    const getSlideXml = makeSlideXmlGetter(sourceZip);
    const slideMetaByKey = new Map(songJson.slides.map((s) => [s.key, s]));

    for (const key of songJson.order) {
      const slideMeta = slideMetaByKey.get(key);
      if (!slideMeta) {
        throw new Error(`"${title}": order가 알 수 없는 key "${key}"를 참조합니다`);
      }
      slideXmls.push(await getSlideXml(slideMeta.index));
    }
  }

  if (slideXmls.length === 0) {
    throw new Error("생성할 슬라이드가 없습니다 — 곡 제목을 입력해주세요");
  }

  const templateBytes = await fetchTemplateBytes();
  const outZip = await buildPptxFromSlides(templateBytes, slideXmls, JSZip);

  return outZip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}
