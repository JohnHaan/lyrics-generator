"""
1회성 개발 스크립트: 기존 예시 pptx에서 슬라이드를 모두 제거하고
master/11개 layout/theme만 남긴 공유 템플릿(/template/blank.pptx)을 생성한다.

브라우저(JS) 런타임의 병합 엔진이 이 템플릿을 기반으로 슬라이드를 채워 넣는다.
Node가 설치되어 있지 않아 Python(zipfile)으로 작성했지만, 결과물은 순수 OOXML이라
런타임 동작에는 영향이 없다.
"""
import re
import zipfile
from pathlib import Path

SOURCE = Path(__file__).resolve().parent.parent / "260619 금요예배찬양.pptx"
OUTPUT = Path(__file__).resolve().parent.parent / "template" / "blank.pptx"

APP_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Macintosh PowerPoint</Application><PresentationFormat>와이드스크린</PresentationFormat><Slides>0</Slides><Notes>0</Notes><HiddenSlides>0</HiddenSlides><ScaleCrop>false</ScaleCrop><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion></Properties>"""

CORE_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>찬양 콘티</dc:title><dc:creator>lyrics-generator</dc:creator></cp:coreProperties>"""


def strip_slide_overrides(content_types_xml: str) -> str:
    return re.sub(
        r'<Override PartName="/ppt/slides/slide\d+\.xml"[^/]*/>',
        "",
        content_types_xml,
    )


def strip_slide_rels(presentation_rels_xml: str) -> str:
    return re.sub(
        r'<Relationship [^>]*Target="slides/slide\d+\.xml"/>',
        "",
        presentation_rels_xml,
    )


def empty_sld_id_lst(presentation_xml: str) -> str:
    return re.sub(
        r"<p:sldIdLst>.*?</p:sldIdLst>",
        "<p:sldIdLst/>",
        presentation_xml,
        flags=re.S,
    )


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(SOURCE) as src:
        names = src.namelist()
        skip_prefixes = ("ppt/slides/",)
        skip_exact = {"docProps/thumbnail.jpeg"}

        with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as out:
            for name in names:
                if name.startswith(skip_prefixes) or name in skip_exact:
                    continue

                data = src.read(name)

                if name == "[Content_Types].xml":
                    text = strip_slide_overrides(data.decode("utf-8"))
                    text = text.replace(
                        '<Default Extension="jpeg" ContentType="image/jpeg"/>', ""
                    )
                    data = text.encode("utf-8")
                elif name == "ppt/_rels/presentation.xml.rels":
                    data = strip_slide_rels(data.decode("utf-8")).encode("utf-8")
                elif name == "ppt/presentation.xml":
                    data = empty_sld_id_lst(data.decode("utf-8")).encode("utf-8")
                elif name == "_rels/.rels":
                    text = data.decode("utf-8")
                    text = re.sub(
                        r'<Relationship [^>]*Target="docProps/thumbnail.jpeg"/>',
                        "",
                        text,
                    )
                    data = text.encode("utf-8")
                elif name == "docProps/app.xml":
                    data = APP_XML.encode("utf-8")
                elif name == "docProps/core.xml":
                    data = CORE_XML.encode("utf-8")

                out.writestr(name, data)

    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
