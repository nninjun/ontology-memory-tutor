# CS471 Concept Memory Tutor 한국어 설명서

이 프로젝트는 단순한 course-note 온톨로지 뷰어가 아니라, 학생이 복습할 때 생기는 **개념 단위의 이해 상태**를 추적하는 복습 보조 시스템입니다.

핵심 아이디어는 LLM의 long-term memory가 모든 대화 내용을 저장하는 것이 아니라, 학생에게 실제로 필요한 **concept list, confusion signal, evidence, memory state**만 저장해야 한다는 것입니다.

## 현재 기능

- `output/Course Notes_*/markdown/paper.md`와 `output/Slides_*/markdown/paper.md`에서 course ontology를 생성합니다.
- `gpt-oss-120b` vLLM 서버가 있으면 ontology definition을 quality pass로 다듬습니다.
- 학생 질문에서 긴 답변을 만드는 대신 관련 concept list를 뽑습니다.
- confusion signal을 감지합니다.
  - 예: `why`, `difference`, `don't understand`, `헷갈`, `모르`, `차이`
- 학생 질문을 `STORE`, `UPDATE`, `IGNORE`로 분류합니다.
- 전체 대화 로그를 저장하지 않고 concept-level memory trace만 저장합니다.
- concept별 학생 상태를 추적합니다.
  - `new`
  - `confused`
  - `reviewing`
  - `known`
- 학생 또는 발표자가 concept 상태, strength, note를 직접 수정할 수 있습니다.
  - 오른쪽 Student State 패널의 상태 버튼으로 즉시 바꿀 수 있습니다.
  - Memory Dashboard에서도 각 concept row를 직접 수정할 수 있습니다.
- 오른쪽 패널에서 course-note evidence, 관련 그림, table preview를 함께 볼 수 있습니다.
- 왼쪽 View Size 컨트롤에서 detail panel 폭, graph 높이, evidence 이미지 크기를 조절할 수 있습니다.
- Critical Note Check 패널에서 course note statement를 더 비판적으로 검토할 수 있습니다.

## 실행 방법

일반적인 Node.js 환경에서는 다음처럼 실행합니다.

```bash
git clone <repo-url>
cd <repo-name>
npm install
npm run dev
```

브라우저에서 다음 주소로 접속합니다.

```text
http://localhost:5173/
```

서버에서 네트워크 주소로 접속해야 하면 Vite가 출력하는 `Network` 주소를 사용합니다.

시스템 전체에 Node.js/npm을 설치하기가 부담스럽다면 conda, nvm, fnm, mise 같은 격리된 Node 환경을 사용하면 됩니다. 개발 과정에서는 conda 환경을 썼지만, 특정 환경 이름이 재현에 필수는 아닙니다.

## Ontology 재생성

vLLM 없이 deterministic offline cache를 만들려면:

```bash
npm run generate:ontology
```

## GitHub에 올릴 때

공개 GitHub repo에는 코드와 데모용 캐시만 올리는 것을 권장합니다.

포함해도 좋은 것:

- `src/`
- `scripts/`
- `public/ontology.json`
- `public/visuals/`
- `package.json`
- `package-lock.json`
- `README.md`, `README.ko.md`

공개 repo에서 제외하는 것이 안전한 것:

- `input/`: 원본 PDF 수업 자료
- `output/`: PDF parser가 만든 course note 원문/이미지 전체
- `node_modules/`
- `dist/`
- `*.log`

다른 사람이 데모만 재현하려면:

```bash
git clone <repo-url>
cd <repo-name>
npm install
npm run dev
```

그 다음 브라우저에서:

```text
http://localhost:5173/
```

이 방식은 `public/ontology.json`과 `public/visuals/`를 사용하므로 원본 PDF나 vLLM 서버가 없어도 데모가 실행됩니다.

ontology를 처음부터 재생성하려면 같은 parser 결과물이 `output/` 아래에 있어야 합니다.

```text
output/Course Notes_1/markdown/paper.md
output/Course Notes_1/figures/*.png
output/Course Notes_1/layout/page_*_preview.png
...
output/Slides_9/markdown/paper.md
```

그리고 다음을 실행합니다.

```bash
npm run generate:ontology
```

vLLM까지 사용하려면 8004번 포트에 모델을 띄운 뒤:

```bash
USE_VLLM_ONTOLOGY=1 \
VLLM_BASE_URL=http://localhost:8004 \
VLLM_MODEL=openai/gpt-oss-120b \
npm run generate:ontology
```

## 발표용 한 문장

이 시스템은 course note를 온톨로지로 바꾸는 데서 끝나지 않고, 학생 질문을 concept-level memory update로 압축해 LLM 복습 도구의 long-term memory가 더 단순하고 유용해지도록 설계한 프로토타입입니다.

## 제출 포인트

- Novelty는 ontology 자체가 아니라 **selective concept memory**입니다.
- 학생의 confusion을 감지하고, 관련 concept만 저장합니다.
- raw chat history 대신 `STORE / UPDATE / IGNORE` decision과 concept state만 유지합니다.
- figure/table evidence를 함께 보여줘서 학생이 텍스트 설명만 읽는 것보다 더 쉽게 복습할 수 있습니다.
