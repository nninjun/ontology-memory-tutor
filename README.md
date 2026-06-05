# CS471 Concept Memory Tutor

An interactive Vite React prototype for reviewing CS471 course notes through a compact, evidence-backed ontology plus student-specific concept memory. The app demonstrates the project idea from `goal.md`: long-term memory for LLM study tools should preserve only necessary concepts, relations, evidence, and student confusion signals instead of accumulating noisy conversation history.

## What It Does

- Reads parsed course material from `output/Course Notes_*/markdown/paper.md` and `output/Slides_*/markdown/paper.md`.
- Generates `public/ontology.json`, a cached concept graph with evidence snippets.
- Extracts short related concept lists from student questions instead of producing long answers.
- Detects simple confusion signals such as "why", "difference", "don't understand", "헷갈", and "모르".
- Classifies each student question as `STORE`, `UPDATE`, or `IGNORE`.
- Updates editable per-concept memory state: `new`, `confused`, `reviewing`, or `known`.
- Shows a concept memory dashboard and a log that stores concept-level signals, not full chat transcripts.
- Allows direct student memory edits from both the dashboard rows and the selected concept panel.
- Provides view-size controls for graph height, detail panel width, and evidence image size.
- Adds figure/table evidence from the PDF parser output when available.
- Adds a critical note check panel for inspecting course-note claims, assumptions, and contrastive questions.
- Keeps the ontology explorer with session filters, relation filters, selected concept details, and review paths.
- Works offline during demos because the frontend only depends on the cached JSON.

## Commands

For a normal Node.js setup:

```bash
npm install
npm run generate:ontology
npm run dev
npm run build
```

If you prefer not to install Node.js system-wide, use any isolated Node environment such as conda, nvm, fnm, or mise. The original development machine used a conda environment, but that environment name is not required for reproduction.

## Optional vLLM Pass

Start a vLLM OpenAI-compatible server for `gpt-oss-120b`, then run:

```bash
USE_VLLM_ONTOLOGY=1 VLLM_BASE_URL=http://localhost:8004 VLLM_MODEL=openai/gpt-oss-120b npm run generate:ontology
```

If the server is unavailable or returns invalid JSON, the generator falls back to the deterministic offline cache.

## Reproducing From GitHub

Recommended public repo contents:

- Include the app code, `package.json`, `package-lock.json`, `public/ontology.json`, and `public/visuals/`.
- Do not include `input/` or `output/` unless you have permission to redistribute the course PDFs and parsed notes.
- The committed `public/ontology.json` lets another person run the demo without the original PDFs or vLLM.

Fresh setup:

```bash
git clone <repo-url>
cd <repo-name>
npm install
npm run dev
```

Then open:

```text
http://localhost:5173/
```

To fully regenerate the ontology, the reproducer needs the same parsed PDF output layout under `output/`:

```text
output/Course Notes_1/markdown/paper.md
output/Course Notes_1/figures/*.png
output/Course Notes_1/layout/page_*_preview.png
...
output/Slides_9/markdown/paper.md
```

Then run either:

```bash
npm run generate:ontology
```

or, with vLLM:

```bash
USE_VLLM_ONTOLOGY=1 \
VLLM_BASE_URL=http://localhost:8004 \
VLLM_MODEL=openai/gpt-oss-120b \
npm run generate:ontology
```

## Prototype Argument

The novelty is not "we made a concept map." The novelty is that the system treats review as a selective memory update problem:

- student input is compressed into a short concept list,
- confusion signals decide whether memory should be stored, updated, or ignored,
- the student's state is tracked per concept,
- visual/table evidence helps students inspect the original course material,
- raw conversation history is deliberately not the long-term memory.
