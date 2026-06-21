// 사용자가 업로드한 pptx를 파싱해서 songs/ 디렉토리에 들어갈
// song.pptx + song.json 데이터를 만든다. 업로드된 슬라이드 순서를 곧 곡의
// 재생 순서로 그대로 사용한다 (반복 구간이 필요하면 업로드 후 GitHub에서
// song.json의 order[]를 직접 수정하면 된다).

import { resolveSlideOrder, fetchTemplateBytes, buildPptxFromSlides } from "./ooxml.js";

/**
 * pptxArrayBuffer: 업로드된 pptx 파일의 ArrayBuffer
 * title: 사용자가 입력한 곡 제목
 * 반환: { songJson, pptxBlob }
 */
export async function buildSongFromUpload(pptxArrayBuffer, title, JSZip) {
  const uploadedZip = await JSZip.loadAsync(pptxArrayBuffer);
  const orderedPaths = await resolveSlideOrder(uploadedZip);

  if (orderedPaths.length === 0) {
    throw new Error("업로드한 pptx에 슬라이드가 없습니다");
  }

  const slideXmls = await Promise.all(
    orderedPaths.map((path) => uploadedZip.file(path).async("string"))
  );

  const keys = slideXmls.map((_, i) => `slide${i + 1}`);

  const songJson = {
    title,
    sourceFile: "song.pptx",
    slides: keys.map((key, i) => ({ key, index: i, label: key })),
    order: keys,
  };

  const templateBytes = await fetchTemplateBytes();
  const outZip = await buildPptxFromSlides(templateBytes, slideXmls, JSZip);
  const pptxArrayBufferOut = await outZip.generateAsync({ type: "arraybuffer" });

  return { songJson, pptxArrayBuffer: pptxArrayBufferOut };
}
