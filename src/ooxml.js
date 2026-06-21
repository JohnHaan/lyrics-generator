// pptx(OOXML) zip을 다루는 공용 헬퍼. pptxMerge.js(콘티 합치기)와
// songUpload.js(새 곡 등록)가 둘 다 사용한다.
//
// 핵심 전제: 모든 슬라이드의 텍스트 서식이 placeholder 상속이 아니라 런(run) 단위
// inline 서식이라서, 슬라이드 XML을 그대로 복사해도 어떤 슬라이드 레이아웃을
// 가리키든 시각적으로 동일하게 렌더링된다. 그래서 출력은 공유 템플릿(master/1개
// layout/theme) 하나만 쓰고, 모든 슬라이드는 그 템플릿의 layout을 가리키도록
// rels를 새로 만든다.

const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const SLIDE_LAYOUT_TARGET = "../slideLayouts/slideLayout2.xml";

/**
 * presentation.xml의 sldIdLst -> presentation.xml.rels를 따라가
 * 실제 재생 순서대로 슬라이드 파트 경로 목록을 반환한다.
 * slideN.xml 파일명의 숫자는 순서를 보장하지 않으므로 이 경로로만 순서를 신뢰해야 한다.
 */
export async function resolveSlideOrder(zip) {
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

export async function fetchTemplateBytes() {
  const res = await fetch(new URL("../template/blank.pptx", import.meta.url));
  if (!res.ok) throw new Error("템플릿 파일을 불러오지 못했습니다");
  return res.arrayBuffer();
}

/**
 * 공유 템플릿(master/layout/theme)에 slideXmls를 순서대로 채워 넣어
 * 독립적인 pptx를 만든다. 같은 문자열이 여러 번 들어오면(반복 구간) 매번
 * 새 슬라이드 파트로 복제된다 — pptx는 한 파트를 두 번 참조할 수 없다.
 */
export async function buildPptxFromSlides(templateBytes, slideXmls, JSZip) {
  const outZip = await JSZip.loadAsync(templateBytes);

  let contentTypes = await outZip.file("[Content_Types].xml").async("string");
  let presRels = await outZip.file("ppt/_rels/presentation.xml.rels").async("string");
  let presentationXml = await outZip.file("ppt/presentation.xml").async("string");

  const existingRids = [...presRels.matchAll(/Id="rId(\d+)"/g)].map((m) => parseInt(m[1], 10));
  let nextRid = (existingRids.length ? Math.max(...existingRids) : 0) + 1;
  let nextSldId = 256;

  const overrides = [];
  const relsEntries = [];
  const sldIdEntries = [];

  slideXmls.forEach((slideXml, i) => {
    const outSlideName = `slide${i + 1}.xml`;

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
  });

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

  return outZip;
}
