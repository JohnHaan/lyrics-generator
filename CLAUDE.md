# 인지저스팀 가사 제조기

교회 찬양팀(인지저스)이 예배 찬양 콘티(가사 슬라이드 pptx)를 자동으로 조합하는
정적 웹앱. GitHub Pages로 배포되며 **백엔드가 없다** — 모든 로직이 브라우저
JavaScript에서 실행된다.

배포 주소: https://johnhaan.github.io/lyrics-generator/

## 핵심 아키텍처

1. **곡 저장**: 곡마다 `/songs/song-NN/`에 `song.pptx`(고유 섹션 슬라이드만, 반복
   없음) + `song.json`(섹션 순서/반복 메타데이터)을 둔다.
2. **순서/반복은 메타데이터로 분리**: `song.pptx` 안의 슬라이드는 한 곡 안에서
   고유한 것만 1번씩 저장하고, 실제 재생 순서(반복 포함)는 `song.json`의
   `order[]`가 key를 참조하는 방식으로 따로 기록한다.
3. **곡 검색은 정확히 일치**: 콘티 조합 시 제목은 `manifest.json`에 등록된
   문자열과 정확히 같아야 매칭된다.
4. **전부 브라우저에서 처리**: pptx 병합·생성은 JSZip으로 OOXML 파트를 직접
   조립한다 (`src/ooxml.js`). 백엔드/빌드 단계 없음 — 정적 파일만 푸시하면 배포.
5. **새 곡 추가**는 두 경로: (a) 웹 UI의 업로드 기능으로 GitHub에 직접 커밋,
   (b) `/raw/`에 pptx를 넣고 1회성 마이그레이션 스크립트로 변환.

## 데이터 스키마

### `songs/manifest.json`
```json
{ "songs": ["song-01/song.json", "song-02/song.json", ...] }
```
**title을 여기 저장하지 않는다.** 화면에 보여줄 제목은 항상 각 `song.json`을
직접 fetch해서 읽는다 (`src/songLibrary.js`의 `listSongs()`). manifest가
오래돼도 화면 제목이 실제 데이터와 어긋나지 않도록 하기 위한 구조적 결정.

### `songs/song-NN/song.json`
```json
{
  "title": "곡 제목",
  "sourceFile": "song.pptx",
  "slides": [
    { "key": "A1", "index": 1, "label": "A1" }
  ],
  "order": ["title", "A1", "A2", "B", "B", "A1", "A2"]
}
```
- **`index`가 진짜 식별자** (`song.pptx` 안에서 0-based 슬라이드 위치, sldIdLst
  기준 실제 재생 순서). `label`은 사람이 읽기 위한 표시용일 뿐, 코드에서는
  쓰지 않는다.
- **같은 라벨이라도 가사(텍스트)가 다르면 반드시 다른 key를 쓴다**
  (`A1`/`A1b`, `Ba`/`Bb` 등). 라벨 문자열이 같다고 같은 슬라이드로 합치면 안 됨
  — 실제로 한 곡 안에서 같은 라벨에 다른 가사가 들어간 사례가 있었다.
- 반대로 **텍스트가 완전히 동일하면 같은 key로 합쳐 중복 저장하지 않는다.**
  텍스트가 한 글자라도 다르면(반복 표시 "X2" 차이 등 포함) 별도 key로 둔다 —
  애매하면 분리하는 쪽이 안전.

## 슬라이드 표준 스타일

기준 파일: `template/sample.pptx` (제목 1장 + 가사 2장)

| 요소 | 폰트 | 크기 | 색상 | 정렬 |
|---|---|---|---|---|
| 제목 슬라이드 | 휴먼모음T, bold | 96pt | 노란색 `FFFF00` | 가운데, anchor=ctr |
| 가사 슬라이드 | 휴먼모음T, bold | 72pt | 흰색 | 가운데 |

슬라이드 크기: 12192000 × 6858000 EMU (16:9). 배경은 슬라이드 마스터에서 단색
검정으로 고정. 모든 텍스트는 placeholder 상속이 아니라 **런(run) 단위 inline
서식**이라 — 이 덕분에 어떤 슬라이드가 어떤 레이아웃을 가리키든 시각적으로
동일하게 렌더링된다. 이 특성이 "공유 템플릿 + 슬라이드 복사" 병합 방식을 가능하게
하는 핵심 전제다 (아래 OOXML 병합 절 참고).

## OOXML 병합 방식 (왜 이렇게 만들었는지)

- 출력 pptx는 하나의 공유 템플릿(`template/blank.pptx` — slideMaster 1개, layout
  11개, theme만 있고 슬라이드는 0개)을 기반으로, 필요한 슬라이드 XML을 그대로
  복사해 붙인다. 각 슬라이드의 `_rels`는 항상 새로 만들어서 템플릿의 layout을
  가리키게 한다.
- 소스 pptx의 진짜 슬라이드 순서는 `presentation.xml`의 `sldIdLst` →
  `presentation.xml.rels`를 따라가야 한다. **slideN.xml의 파일명 숫자는 순서를
  보장하지 않는다** (PowerPoint가 편집 중 재배열해도 파일명은 안 바뀜).
  `resolveSlideOrder()` (`src/ooxml.js`) / `resolve_slide_order()`
  (`tools/ooxml_utils.py`)가 이 로직을 캡슐화한다.
- 같은 섹션이 반복되면 슬라이드 파트를 매번 새로 복제한다 (pptx는 한 파트를
  두 번 참조하는 구조를 지원하지 않음).
- `p:sldId id`는 256부터 1씩 증가, `r:id`는 기존 rId 최대값 다음부터 1씩 증가.
- 이 로직은 **브라우저용(`src/ooxml.js`, JSZip)과 도구용
  (`tools/ooxml_utils.py`, zipfile) 양쪽에 미러링되어 있다.** 한쪽만 고치고
  다른 쪽을 잊으면 안 됨 — 항상 같은 결과가 나와야 한다.

## 파일 구조

```
/index.html                       UI: 검색+페이지네이션 곡 목록(좌) / 콘티 순서(우, D&D)
                                   / 새 가사 등록 섹션(샘플 다운로드+업로드)
/src/
  app.js                          UI 이벤트 ↔ 나머지 모듈 연결
  ooxml.js                        OOXML 조립 공용 로직 (resolveSlideOrder,
                                   buildPptxFromSlides) — pptxMerge/songUpload가 사용
  pptxMerge.js                    여러 곡을 골라 콘티 pptx로 합치기 (buildSetlist)
  songLibrary.js                  manifest 로드, 제목 검색, 곡 song.json/pptx 지연로드+캐시
  songUpload.js                   업로드된 pptx → song.json/song.pptx 변환 (슬라이드
                                   순서 그대로 = 재생 순서, 반복 없음)
  githubCommit.js                 GitHub Git Data API로 새 곡 파일을 단일 커밋으로 추가
/songs/manifest.json              곡 경로 목록 (title 없음)
/songs/song-NN/{song.pptx,song.json}
/template/blank.pptx               공유 템플릿 (master+layout 11개+theme, 슬라이드 0개)
/template/sample.pptx              업로드 양식 샘플 (표준 스타일 3슬라이드)
/vendor/jszip.min.js               JSZip 로컬 vendoring (CDN 의존 없음)
/assets/injesus-logo.jpeg          로고
/tools/                            Node 미설치 환경이라 Python으로 작성한 1회성/개발용 스크립트
  ooxml_utils.py                  src/ooxml.js의 Python 미러 + 슬라이드 생성 헬퍼
                                   (paragraph/slide_xml/title_slide/lyric_slide*)
  make_template.py                template/blank.pptx 생성
  make_sample.py                  template/sample.pptx 생성
  build_manifest.py               songs/*/song.json 스캔 → manifest.json 생성
                                   (새 곡 추가 후 반드시 재실행)
  split_source_deck.py            (1회성, 완료됨) 최초 예시 콘티 50슬라이드 분리
  add_raw_songs.py                (1회성, 완료됨) 라벨 있는 raw 5곡 등록
  standardize_raw_batch2.py       (1회성, 완료됨) 제목/폰트 표준에 안 맞는 raw 9곡
                                   표준화 후 등록 — 새 raw 묶음이 또 들어오면 이
                                   스크립트의 패턴을 참고해서 새로 작성
```

## 새 곡을 추가하는 방법

### A. 웹 UI 업로드 (표준 형식에 이미 맞는 경우)
1. "샘플 다운로드"로 `template/sample.pptx` 형식 확인
2. 같은 스타일로 pptx 작성 (슬라이드 1장=제목, 그 다음부터 슬라이드 1장당 구절
   하나, **슬라이드 순서 = 재생 순서**, 반복 없음)
3. 곡 제목 + 파일 + GitHub PAT(repo 쓰기 권한) 입력 후 업로드
4. `src/githubCommit.js`가 `song.pptx`+`song.json`+`manifest.json` 갱신을 **단일
   커밋**으로 main에 푸시. 토큰은 브라우저(localStorage, 선택 시)에만 남고
   서버로 전송되지 않음.
5. 반복 구간이 필요하면 업로드 후 GitHub에서 `song.json`의 `order[]`를 직접 수정.

### B. raw/ + 변환 스크립트 (형식이 다르거나 분석이 필요한 경우)
1. `/raw/`에 pptx 추가
2. 슬라이드별 텍스트를 직접 읽고 분석 (subagent에게 위임 가능) —
   - 제목 슬라이드가 있는지, 폰트/크기/색상이 표준과 같은지
   - 반복 구조(같은 텍스트가 여러 슬라이드에 나오는지)
   - 같은 라벨인데 가사가 다른 경우는 없는지
   - 가사가 아닌 진행 메모("간주", "(다음 이어가기)" 등)가 섞여 있는지 —
     **이런 비가사 내용을 빼도 될지는 항상 사용자에게 먼저 확인한다**
     (가사 내용을 임의로 편집하지 않는 것이 원칙)
3. 분석 결과로 `tools/standardize_raw_batch2.py`와 비슷한 1회성 스크립트 작성:
   - 폰트/형식이 이미 표준이면 `tools/add_raw_songs.py` 패턴(슬라이드 XML
     그대로 복사 + key 매핑)을 따른다.
   - 폰트/형식이 다르면(테마색, placeholder, 60pt 등) **기존 XML을 고치지 말고**
     텍스트만 뽑아서 `ooxml_utils.title_slide()` / `lyric_slide_from_lines()`로
     표준 스타일 슬라이드를 새로 만든다 (`standardize_raw_batch2.py` 참고).
   - 제목 슬라이드가 없으면 파일명(확장자 제외)으로 만든다.
   - dedup은 항상 **텍스트 완전 일치**로만 판단 (라벨 추측 금지).
4. **검증을 항상 자동화한다**: 재구성한 슬라이드 텍스트 시퀀스가 원본과
   (줄바꿈 표현 차이 제외하고) 정확히 일치하는지 스크립트로 비교. 폰트/크기/색상
   anomaly도 python-pptx로 일괄 점검.
5. `python3 tools/build_manifest.py` 실행 → `songs/manifest.json` 갱신
6. 변환에 쓴 `/raw/` 원본은 등록 완료 후 정리(삭제) — 단, 삭제 전에 사용자에게
   확인.

## 검증 워크플로

- Node가 설치되어 있지 않은 환경 — 개발/마이그레이션 도구는 Python(zipfile,
  python-pptx)으로 작성한다. 런타임(브라우저)은 항상 JS.
- 기능 변경 후에는 **반드시 실제로 브라우저를 띄워 확인한다** (`python3 -m
  http.server`로 정적 서빙 + Playwright로 클릭/드래그/다운로드까지 구동). 콘솔
  에러(`page.on("console")`, `page.on("pageerror")`)도 항상 확인.
- GitHub API를 호출하는 기능(업로드 커밋)은 실제 레포에 손대지 않고
  `page.route()`로 `https://api.github.com/**`를 모킹해서 요청 순서/payload를
  검증한다. 진짜 테스트 커밋이 레포에 남으면(예: 과거 song-06 "주 은혜라" 테스트)
  사용자에게 확인 후 정리한다.
- pptx 결과물 검증은 python-pptx로: 슬라이드 수, 텍스트 시퀀스, 폰트명/크기/
  bold 여부 일괄 점검.
- GitHub Pages 배포 확인 시 `gh api repos/JohnHaan/lyrics-generator/pages/builds/latest`로
  빌드 상태를 폴링하고, 라이브 URL을 직접 fetch/Playwright로 재확인한다 (커밋
  직후 빌드는 보통 30~90초 걸림, CDN 캐시 때문에 더 걸릴 수도 있음).

## 작업 시 지켜야 할 원칙

- **가사 내용을 임의로 수정하지 않는다.** 폰트/형식 변경 작업이라도 텍스트
  자체는 원문 그대로 유지한다. 내용 삭제가 필요해 보이면(진행 메모, 비가사
  안내문 등) 반드시 사용자에게 먼저 확인.
- **곡 제목 형식**: 번호 prefix("1. ", "2. ") 없음. 메들리는 `+` 양쪽에 공백 없이
  (`곡A+곡B`) — 화면에 보이는 슬라이드 텍스트와 `song.json`의 `title` 필드가
  항상 정확히 같아야 함(다르면 검색 결과 표시가 실제 슬라이드와 어긋나 보임).
- **소스 폴더/test 파일 등 의도치 않게 사라진 파일을 발견하면** 먼저 사용자에게
  확인하고 진행한다(자신이 지운 게 아니면 임의로 복구/삭제하지 않음).
- 메인 브랜치에 바로 push하는 워크플로가 이미 자리잡혀 있음 — 매번 PR을
  만들 필요 없이 커밋 후 바로 `git push origin main`. (단, 한 번이라도 사용자가
  다른 방식을 요청하면 그 지시가 우선.)
- 새 기능을 만들 때 아키텍처에 영향이 큰 결정(백엔드 필요 여부, 인증 방식,
  데이터 모델 변경 등)은 구현 전에 사용자에게 먼저 확인한다.
