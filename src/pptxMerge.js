// 브라우저에서 곡별 source pptx의 슬라이드를 골라 하나의 콘티 pptx로 합치는 엔진.
// 백엔드 없이 JSZip만으로 OOXML 파트를 직접 조립한다.
//
// 핵심 전제: 모든 슬라이드의 텍스트 서식이 placeholder 상속이 아니라 런(run) 단위
// inline 서식이라서, 슬라이드 XML을 그대로 복사해도 어떤 슬라이드 레이아웃을
// 가리키든 시각적으로 동일하게 렌더링된다. 그래서 출력은 공유 템플릿(master/1개
// layout/theme) 하나만 쓰고, 모든 소스 곡의 슬라이드는 그 템플릿의 layout을
// 가리키도록 rels를 새로 만든다.

const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/**
 * presentation.xml의 sldIdLst -> presentation.xml.rels를 따라가
 * 실제 재생 순서대로 슬라이드 파트 경로 목록을 반환한다.
 * slideN.xml 파일명의 숫자는 순서를 보장하지 않으므로 이 경로로만 순서를 신뢰해야 한다.
 */
async function resolveSlideOrder(zip) {
  const presentationXml = await zip.file("ppt/presentation.xml").async("string");
  const rIdsInOrder = [...presentationXml.matchAll(/<p:sldId[^>]*r:id="(rId\d+)"/g)].map(
    (m) => m[1]
  );

  const relsXml = await zip.file("ppt/_rels/presentation.xml.rels").async("string");
  const ridToTarget = new Map(
    [...relsXml.matchAll(/<Relationship Id="(rId\d+)"[^>]*Target="(slides\/slide\d+\.xml)"/g)].map(
      (m) => [m[1], m[2]]
    )
  );

  return rIdsInOrder.map((rid) => `ppt/${ridToTarget.get(rid)}`);
}

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

const SLIDE_LAYOUT_TARGET = "../slideLayouts/slideLayout2.xml";

/**
 * songTitlesInOrder: 사용자가 입력한 순서대로의 곡 제목 배열
 * songLibrary: { findSongByTitle(title), loadSong(title) } — songLibrary.js가 제공
 * 반환: 완성된 pptx의 Blob
 */
export async function buildSetlist(songTitlesInOrder, songLibrary, JSZip) {
  const templateBytes = await fetch(new URL("../template/blank.pptx", import.meta.url)).then(
    (res) => {
      if (!res.ok) throw new Error("템플릿 파일을 불러오지 못했습니다");
      return res.arrayBuffer();
    }
  );
  const outZip = await JSZip.loadAsync(templateBytes);

  let contentTypes = await outZip.file("[Content_Types].xml").async("string");
  let presRels = await outZip.file("ppt/_rels/presentation.xml.rels").async("string");
  let presentationXml = await outZip.file("ppt/presentation.xml").async("string");

  const existingRids = [...presRels.matchAll(/Id="rId(\d+)"/g)].map((m) => parseInt(m[1], 10));
  let nextRid = (existingRids.length ? Math.max(...existingRids) : 0) + 1;
  let nextSldId = 256;
  let outputSlideCounter = 0;

  const overrides = [];
  const relsEntries = [];
  const sldIdEntries = [];

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

      const slideXml = await getSlideXml(slideMeta.index);

      outputSlideCounter += 1;
      const outSlideName = `slide${outputSlideCounter}.xml`;

      outZip.file(`ppt/slides/${outSlideName}`, slideXml);
      outZip.file(
        `ppt/slides/_rels/${outSlideName}.rels`,
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          `<Relationship Id="rId1" Type="${NS_R}/slideLayout" Target="${SLIDE_LAYOUT_TARGET}"/>` +
          "</Relationships>"
      );

      overrides.push(
        `<Override PartName="/ppt/slides/${outSlideName}" ` +
          'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
      );

      const rid = `rId${nextRid}`;
      nextRid += 1;
      relsEntries.push(
        `<Relationship Id="${rid}" Type="${NS_R}/slide" Target="slides/${outSlideName}"/>`
      );

      sldIdEntries.push(`<p:sldId id="${nextSldId}" r:id="${rid}"/>`);
      nextSldId += 1;
    }
  }

  if (outputSlideCounter === 0) {
    throw new Error("생성할 슬라이드가 없습니다 — 곡 제목을 입력해주세요");
  }

  contentTypes = contentTypes.replace("</Types>", overrides.join("") + "</Types>");
  outZip.file("[Content_Types].xml", contentTypes);

  presRels = presRels.replace("</Relationships>", relsEntries.join("") + "</Relationships>");
  outZip.file("ppt/_rels/presentation.xml.rels", presRels);

  const sldIdLst = "<p:sldIdLst>" + sldIdEntries.join("") + "</p:sldIdLst>";
  presentationXml = presentationXml.replace(
    /<p:sldIdLst\s*\/>|<p:sldIdLst>.*?<\/p:sldIdLst>/s,
    sldIdLst
  );
  outZip.file("ppt/presentation.xml", presentationXml);

  return outZip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}
