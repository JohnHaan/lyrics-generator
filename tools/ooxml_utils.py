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


# ---- 표준 스타일 슬라이드를 처음부터 새로 만드는 헬퍼 ----
# (raw 가사 pptx는 테마 색/placeholder/autofit 등 제각각이라, 기존 XML을 고치는
# 대신 표준 스타일(폰트 휴먼모음T, 제목 96pt 노란색, 가사 72pt 흰색)로 슬라이드를
# 새로 만든다. tools/make_sample.py도 이 헬퍼를 사용한다.)

_XML_ESCAPE = {"&": "&amp;", "<": "&lt;", ">": "&gt;"}


def xml_escape(text: str) -> str:
    return re.sub(r"[&<>]", lambda m: _XML_ESCAPE[m.group(0)], text)


_RUN_PR_TEMPLATE = (
    '<a:rPr lang="ko-KR" altLang="en-US" sz="{size}" b="1" spc="-300" dirty="0">'
    '<a:ln w="9525"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln>'
    '<a:solidFill><a:srgbClr val="{color}"/></a:solidFill>'
    '<a:latin typeface="휴먼모음T" panose="02030504000101010101" pitchFamily="18" charset="-127"/>'
    '<a:ea typeface="휴먼모음T" panose="02030504000101010101" pitchFamily="18" charset="-127"/>'
    "</a:rPr>"
)


def paragraph(text: str, size: int, color: str) -> str:
    rpr = _RUN_PR_TEMPLATE.format(size=size, color=color)
    return (
        '<a:p><a:pPr marL="0" marR="0" lvl="0" indent="0" algn="ctr" defTabSz="914400" '
        'rtl="0" eaLnBrk="1" fontAlgn="auto" latinLnBrk="1" hangingPunct="1">'
        '<a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef>'
        '<a:spcAft><a:spcPts val="0"/></a:spcAft><a:buClrTx/><a:buSzTx/><a:buFontTx/><a:buNone/>'
        f"<a:tabLst/><a:defRPr/></a:pPr><a:r>{rpr}<a:t>{xml_escape(text)}</a:t></a:r></a:p>"
    )


def slide_xml(paragraphs_xml: str, top: int, height: int, anchor: str = "") -> str:
    body_pr = f'<a:bodyPr wrap="square"{anchor}><a:noAutofit/></a:bodyPr>'
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        "<p:cSld><p:spTree>"
        '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
        '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
        "<p:sp>"
        '<p:nvSpPr><p:cNvPr id="2" name="TextBox 1"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>'
        "<p:spPr>"
        f'<a:xfrm><a:off x="0" y="{top}"/><a:ext cx="12192000" cy="{height}"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>'
        "</p:spPr>"
        f"<p:txBody>{body_pr}<a:lstStyle/>{paragraphs_xml}</p:txBody>"
        "</p:sp>"
        "</p:spTree></p:cSld>"
        "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>"
        "</p:sld>"
    )


def title_slide(text: str) -> str:
    return slide_xml(
        paragraph(text, 9600, "FFFF00"), top=1210272, height=4437456, anchor=' anchor="ctr"'
    )


def lyric_slide_from_lines(lines: list[str]) -> str:
    """label 없이, 주어진 줄들을 그대로(흰색 72pt) 한 줄씩 단락으로 채운 가사 슬라이드."""
    paragraphs = "".join(paragraph(line, 7200, "FFFFFF") for line in lines)
    return slide_xml(paragraphs, top=635505, height=5469203)


def lyric_slide(label: str, lines: list[str]) -> str:
    """첫 줄 앞에 라벨을 붙이는 가사 슬라이드 (예: make_sample.py의 '1절', '후렴')."""
    first, *rest = lines
    return lyric_slide_from_lines([f"{label} {first}", *rest])


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
