"""
pptx(OOXML) zip을 다루기 위한 공용 헬퍼.

브라우저 런타임(src/pptxMerge.js)이 JSZip으로 하는 일과 동일한 작업을
1회성 마이그레이션 스크립트에서도 그대로 수행하기 위해 Python으로 미러링했다.
"""
import re
import zipfile
from pathlib import Path

NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def resolve_slide_order(zf: zipfile.ZipFile) -> list[str]:
    """presentation.xml의 sldIdLst -> presentation.xml.rels를 따라가
    실제 재생 순서대로 슬라이드 파트 경로 목록을 반환한다.
    slideN.xml의 파일명 숫자는 순서를 보장하지 않으므로 이 경로로만 순서를 신뢰한다.
    """
    presentation_xml = zf.read("ppt/presentation.xml").decode("utf-8")
    rids_in_order = re.findall(r'<p:sldId[^>]*r:id="(rId\d+)"', presentation_xml)

    rels_xml = zf.read("ppt/_rels/presentation.xml.rels").decode("utf-8")
    rid_to_target = dict(
        re.findall(
            r'<Relationship Id="(rId\d+)"[^>]*Target="(slides/slide\d+\.xml)"',
            rels_xml,
        )
    )

    return [f"ppt/{rid_to_target[rid]}" for rid in rids_in_order]


def extract_text(slide_xml: str) -> str:
    """검증용: 슬라이드 XML에서 <a:t> 런 텍스트만 이어붙여 반환."""
    return "".join(re.findall(r"<a:t>(.*?)</a:t>", slide_xml, flags=re.S))


def strip_slide_overrides(content_types_xml: str) -> str:
    return re.sub(
        r'<Override PartName="/ppt/slides/slide\d+\.xml"[^/]*/>',
        "",
        content_types_xml,
    )


def build_song_pptx(
    template_path: Path,
    slide_xmls: list[str],
    layout_target: str = "../slideLayouts/slideLayout2.xml",
) -> bytes:
    """공유 템플릿(blank.pptx)을 기반으로 slide_xmls를 순서대로 채워 넣은
    독립 실행 가능한 pptx 바이트를 만든다. 브라우저 병합 엔진과 동일한 규칙
    (전역 카운터로 slideN.xml 새 이름 부여, rels는 항상 layout을 새로 가리키게 재작성,
    presentation.xml/.rels/[Content_Types].xml 패치)을 따른다.
    """
    import io

    with zipfile.ZipFile(template_path) as tpl:
        content_types = tpl.read("[Content_Types].xml").decode("utf-8")
        pres_rels = tpl.read("ppt/_rels/presentation.xml.rels").decode("utf-8")
        presentation_xml = tpl.read("ppt/presentation.xml").decode("utf-8")
        other_names = [
            n
            for n in tpl.namelist()
            if n not in ("[Content_Types].xml", "ppt/_rels/presentation.xml.rels", "ppt/presentation.xml")
        ]
        other_data = {n: tpl.read(n) for n in other_names}

    overrides = []
    rels_entries = []
    sld_id_entries = []

    existing_rids = [int(m) for m in re.findall(r'Id="rId(\d+)"', pres_rels)]
    next_rid = max(existing_rids, default=0) + 1
    next_sld_id = 256

    out_buf = io.BytesIO()
    with zipfile.ZipFile(out_buf, "w", zipfile.ZIP_DEFLATED) as out:
        for name, data in other_data.items():
            out.writestr(name, data)

        for i, slide_xml in enumerate(slide_xmls, start=1):
            slide_name = f"slide{i}.xml"
            out.writestr(f"ppt/slides/{slide_name}", slide_xml)
            out.writestr(
                f"ppt/slides/_rels/{slide_name}.rels",
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                f'<Relationship Id="rId1" Type="{NS_R}/slideLayout" Target="{layout_target}"/>'
                "</Relationships>",
            )

            overrides.append(
                f'<Override PartName="/ppt/slides/{slide_name}" '
                'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
            )
            rid = f"rId{next_rid}"
            next_rid += 1
            rels_entries.append(
                f'<Relationship Id="{rid}" Type="{NS_R}/slide" Target="slides/{slide_name}"/>'
            )
            sld_id_entries.append(f'<p:sldId id="{next_sld_id}" r:id="{rid}"/>')
            next_sld_id += 1

        content_types = content_types.replace(
            "</Types>", "".join(overrides) + "</Types>"
        )
        out.writestr("[Content_Types].xml", content_types)

        pres_rels = pres_rels.replace(
            "</Relationships>", "".join(rels_entries) + "</Relationships>"
        )
        out.writestr("ppt/_rels/presentation.xml.rels", pres_rels)

        sld_id_lst = "<p:sldIdLst>" + "".join(sld_id_entries) + "</p:sldIdLst>"
        presentation_xml = re.sub(
            r"<p:sldIdLst\s*/>|<p:sldIdLst>.*?</p:sldIdLst>",
            sld_id_lst,
            presentation_xml,
            count=1,
            flags=re.S,
        )
        out.writestr("ppt/presentation.xml", presentation_xml)

    return out_buf.getvalue()
