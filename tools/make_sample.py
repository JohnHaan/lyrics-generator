"""
업로드 양식 안내용 샘플 pptx(/template/sample.pptx)를 생성한다.
실제 곡과 똑같은 스타일(폰트 휴먼모음T, 제목=노란 96pt, 가사=흰 72pt, 가운데정렬)로
슬라이드 3장(제목 1장 + 가사 2장)을 만들어, 사용자가 이 파일을 열어 텍스트만
바꿔서 자신의 곡을 만들 수 있게 한다.

업로드 규칙: 슬라이드 순서 그대로가 곡의 재생 순서가 된다 (반복 구간이
필요하면 업로드 후 GitHub에서 song.json의 order[]를 직접 수정).
"""
from pathlib import Path

from ooxml_utils import build_song_pptx

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "template" / "blank.pptx"
OUTPUT = ROOT / "template" / "sample.pptx"

RUN_PR_TEMPLATE = (
    '<a:rPr lang="ko-KR" altLang="en-US" sz="{size}" b="1" spc="-300" dirty="0">'
    '<a:ln w="9525"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln>'
    '<a:solidFill><a:srgbClr val="{color}"/></a:solidFill>'
    '<a:latin typeface="휴먼모음T" panose="02030504000101010101" pitchFamily="18" charset="-127"/>'
    '<a:ea typeface="휴먼모음T" panose="02030504000101010101" pitchFamily="18" charset="-127"/>'
    "</a:rPr>"
)


def paragraph(text: str, size: int, color: str) -> str:
    rpr = RUN_PR_TEMPLATE.format(size=size, color=color)
    return (
        '<a:p><a:pPr marL="0" marR="0" lvl="0" indent="0" algn="ctr" defTabSz="914400" '
        'rtl="0" eaLnBrk="1" fontAlgn="auto" latinLnBrk="1" hangingPunct="1">'
        '<a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef>'
        '<a:spcAft><a:spcPts val="0"/></a:spcAft><a:buClrTx/><a:buSzTx/><a:buFontTx/><a:buNone/>'
        f"<a:tabLst/><a:defRPr/></a:pPr><a:r>{rpr}<a:t>{text}</a:t></a:r></a:p>"
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
    return slide_xml(paragraph(text, 9600, "FFFF00"), top=1210272, height=4437456, anchor=' anchor="ctr"')


def lyric_slide(label: str, lines: list[str]) -> str:
    paragraphs = paragraph(f"{label} {lines[0]}", 7200, "FFFFFF") + "".join(
        paragraph(line, 7200, "FFFFFF") for line in lines[1:]
    )
    return slide_xml(paragraphs, top=635505, height=5469203)


def main() -> None:
    slides = [
        title_slide("[샘플] 새 찬양 제목"),
        lyric_slide("1절", ["첫 번째 가사 줄", "두 번째 가사 줄", "세 번째 가사 줄"]),
        lyric_slide("후렴", ["후렴 가사 줄 하나", "후렴 가사 줄 둘"]),
    ]

    pptx_bytes = build_song_pptx(TEMPLATE, slides)
    OUTPUT.write_bytes(pptx_bytes)
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
