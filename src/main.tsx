import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type RelationType =
  | "prerequisite_for"
  | "contrasts_with"
  | "example_of"
  | "part_of"
  | "extends"
  | "solves_problem_of";

type Concept = {
  id: string;
  label: string;
  aliases: string[];
  session: number;
  definition: string;
  importance: number;
  memoryPriority: "core" | "supporting" | "context";
};

type Relation = {
  source: string;
  target: string;
  type: RelationType;
  confidence: number;
  evidenceIds: string[];
};

type Evidence = {
  id: string;
  sourceDocument: string;
  sectionHeading: string;
  excerpt: string;
  reference: string;
  sourcePath: string;
  visualPath?: string | null;
  tablePreview?: string[];
};

type Ontology = {
  generatedAt: string;
  model: string;
  concepts: Concept[];
  relations: Relation[];
  evidence: Evidence[];
};

type MemoryStatus = "new" | "confused" | "reviewing" | "known";
type MemoryDecision = "STORE" | "UPDATE" | "IGNORE";

type ConceptMemory = {
  conceptId: string;
  status: MemoryStatus;
  strength: number;
  encounters: number;
  confusionHits: number;
  lastSignal: string;
  note: string;
};

type ReviewTrace = {
  id: string;
  question: string;
  decision: MemoryDecision;
  signal: string;
  confidence: number;
  concepts: string[];
  timestamp: string;
};

type AnalysisResult = {
  decision: MemoryDecision;
  signal: string;
  confidence: number;
  concepts: Concept[];
  ignoredReason?: string;
};

const relationLabels: Record<RelationType, string> = {
  prerequisite_for: "Prerequisite",
  contrasts_with: "Contrast",
  example_of: "Example",
  part_of: "Part of",
  extends: "Extends",
  solves_problem_of: "Solves"
};

const relationTypes = Object.keys(relationLabels) as RelationType[];
const sessionPalette = ["#2d5bff", "#009a7a", "#d47000", "#8b46db", "#d13f5f", "#297d8f", "#6c7b00", "#b14497", "#506070"];
const confusionPatterns = [
  "confused",
  "confusing",
  "don't understand",
  "do not understand",
  "not sure",
  "why",
  "how",
  "difference",
  "compare",
  "contrast",
  "헷갈",
  "모르",
  "왜",
  "차이",
  "비교"
];

const starterQuestions = [
  "I do not understand how credit assignment differs from reinforcement learning.",
  "Why does elaboration tolerance matter for LLM memory?",
  "What is the difference between constraint networks and KRR?"
];

function App() {
  const [ontology, setOntology] = useState<Ontology | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [activeSessions, setActiveSessions] = useState<Set<number>>(new Set());
  const [activeRelations, setActiveRelations] = useState<Set<RelationType>>(new Set(relationTypes));
  const [reviewPath, setReviewPath] = useState<string[]>([]);
  const [studentQuestion, setStudentQuestion] = useState(starterQuestions[0]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [memory, setMemory] = useState<Record<string, ConceptMemory>>({});
  const [traceLog, setTraceLog] = useState<ReviewTrace[]>([]);
  const [activeView, setActiveView] = useState<"review" | "graph">("review");
  const [detailWidth, setDetailWidth] = useState(420);
  const [graphHeight, setGraphHeight] = useState(620);
  const [evidenceScale, setEvidenceScale] = useState(1);

  useEffect(() => {
    fetch("/ontology.json")
      .then((res) => res.json())
      .then((data: Ontology) => {
        setOntology(data);
        setSelectedId(data.concepts[0]?.id ?? "");
        setActiveSessions(new Set([...new Set(data.concepts.map((concept) => concept.session))]));
        setMemory(loadMemory(data.concepts));
        setTraceLog(loadTraceLog());
      })
      .catch(() => {
        setOntology(null);
      });
  }, []);

  useEffect(() => {
    if (ontology) localStorage.setItem("cs471-concept-memory", JSON.stringify(memory));
  }, [memory, ontology]);

  useEffect(() => {
    if (ontology) localStorage.setItem("cs471-review-trace", JSON.stringify(traceLog.slice(0, 30)));
  }, [ontology, traceLog]);

  const evidenceById = useMemo(() => new Map(ontology?.evidence.map((item) => [item.id, item]) ?? []), [ontology]);
  const conceptById = useMemo(() => new Map(ontology?.concepts.map((item) => [item.id, item]) ?? []), [ontology]);
  const selected = selectedId ? conceptById.get(selectedId) : undefined;

  const filteredConcepts = useMemo(() => {
    if (!ontology) return [];
    const normalized = query.trim().toLowerCase();
    return ontology.concepts.filter((concept) => {
      const matchesSession = activeSessions.has(concept.session);
      const matchesQuery =
        !normalized ||
        concept.label.toLowerCase().includes(normalized) ||
        concept.aliases.some((alias) => alias.toLowerCase().includes(normalized)) ||
        concept.definition.toLowerCase().includes(normalized);
      return matchesSession && matchesQuery;
    });
  }, [activeSessions, ontology, query]);

  const filteredIds = useMemo(() => new Set(filteredConcepts.map((concept) => concept.id)), [filteredConcepts]);

  const filteredRelations = useMemo(() => {
    if (!ontology) return [];
    return ontology.relations.filter(
      (relation) => filteredIds.has(relation.source) && filteredIds.has(relation.target) && activeRelations.has(relation.type)
    );
  }, [activeRelations, filteredIds, ontology]);

  const connectedRelations = useMemo(() => {
    if (!ontology || !selected) return [];
    return ontology.relations.filter((relation) => relation.source === selected.id || relation.target === selected.id);
  }, [ontology, selected]);

  const selectedEvidence = useMemo(() => evidenceForConcept(selectedId, connectedRelations, evidenceById), [connectedRelations, evidenceById, selectedId]);
  const selectedMemory = selectedId ? memory[selectedId] : undefined;

  const sessions = useMemo(() => {
    if (!ontology) return [];
    return [...new Set(ontology.concepts.map((concept) => concept.session))].sort((a, b) => a - b);
  }, [ontology]);

  const memoryRows = useMemo(() => {
    if (!ontology) return [];
    return ontology.concepts
      .map((concept) => ({ concept, memory: memory[concept.id] }))
      .filter((row) => row.memory)
      .sort((a, b) => {
        const statusRank: Record<MemoryStatus, number> = { confused: 0, reviewing: 1, new: 2, known: 3 };
        return statusRank[a.memory.status] - statusRank[b.memory.status] || b.memory.encounters - a.memory.encounters;
      });
  }, [memory, ontology]);

  const memoryStats = useMemo(() => {
    const rows = Object.values(memory);
    return {
      confused: rows.filter((item) => item.status === "confused").length,
      reviewing: rows.filter((item) => item.status === "reviewing").length,
      known: rows.filter((item) => item.status === "known").length,
      stored: rows.filter((item) => item.encounters > 0).length
    };
  }, [memory]);

  function toggleSession(session: number) {
    setActiveSessions((current) => {
      const next = new Set(current);
      if (next.has(session)) next.delete(session);
      else next.add(session);
      return next.size ? next : current;
    });
  }

  function toggleRelation(type: RelationType) {
    setActiveRelations((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next.size ? next : current;
    });
  }

  function runReview() {
    if (!ontology) return;
    const result = analyzeQuestion(studentQuestion, ontology.concepts, memory);
    setAnalysis(result);
    if (result.concepts[0]) {
      setSelectedId(result.concepts[0].id);
      setReviewPath(buildReviewPath(result.concepts[0].id, ontology.relations));
    }
    if (result.decision !== "IGNORE") {
      setMemory((current) => applyMemoryUpdate(current, result));
    }
    setTraceLog((current) => [
      {
        id: `${Date.now()}`,
        question: studentQuestion,
        decision: result.decision,
        signal: result.signal,
        confidence: result.confidence,
        concepts: result.concepts.map((concept) => concept.id),
        timestamp: new Date().toLocaleString()
      },
      ...current
    ]);
  }

  function createReviewPath() {
    if (!ontology || !selected) return;
    setReviewPath(buildReviewPath(selected.id, ontology.relations));
  }

  function updateMemory(conceptId: string, patch: Partial<ConceptMemory>) {
    setMemory((current) => ({
      ...current,
      [conceptId]: {
        ...current[conceptId],
        ...patch
      }
    }));
  }

  function clearTraceLog() {
    setTraceLog([]);
    localStorage.removeItem("cs471-review-trace");
  }

  if (!ontology) {
    return (
      <main className="loading">
        <div className="loading-panel">
          <strong>Ontology cache not found</strong>
          <span>Run npm run generate:ontology, then start the Vite app.</span>
        </div>
      </main>
    );
  }

  return (
    <main
      className="app-shell"
      style={
        {
          "--detail-width": `${detailWidth}px`,
          "--graph-height": `${graphHeight}px`,
          "--evidence-image-height": `${Math.round(170 * evidenceScale)}px`
        } as React.CSSProperties
      }
    >
      <aside className="control-panel">
        <div className="brand">
          <span className="brand-mark">CS471</span>
          <div>
            <h1>Memory Tutor</h1>
            <p>Concept-level review memory, not conversation hoarding.</p>
          </div>
        </div>

        <div className="view-switch">
          <button className={activeView === "review" ? "active" : ""} onClick={() => setActiveView("review")} type="button">
            Review
          </button>
          <button className={activeView === "graph" ? "active" : ""} onClick={() => setActiveView("graph")} type="button">
            Graph
          </button>
        </div>

        <label className="search-box">
          <span>Concept Search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="credit assignment, KRR..." />
        </label>

        <section className="stats memory-summary">
          <h2>Student Memory</h2>
          <p>{memoryStats.confused} confused</p>
          <p>{memoryStats.reviewing} reviewing</p>
          <p>{memoryStats.known} known</p>
          <small>{memoryStats.stored} concepts have been touched by student signals.</small>
        </section>

        <section>
          <h2>Sessions</h2>
          <div className="chip-grid">
            {sessions.map((session) => (
              <button className={activeSessions.has(session) ? "chip active" : "chip"} key={session} onClick={() => toggleSession(session)} type="button">
                S{session}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Relations</h2>
          <div className="relation-list">
            {relationTypes.map((type) => (
              <label className="toggle-row" key={type}>
                <input checked={activeRelations.has(type)} onChange={() => toggleRelation(type)} type="checkbox" />
                <span>{relationLabels[type]}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="layout-controls">
          <h2>View Size</h2>
          <label>
            Detail width
            <input max="560" min="340" onChange={(event) => setDetailWidth(Number(event.target.value))} step="10" type="range" value={detailWidth} />
          </label>
          <label>
            Graph height
            <input max="860" min="440" onChange={(event) => setGraphHeight(Number(event.target.value))} step="20" type="range" value={graphHeight} />
          </label>
          <label>
            Evidence size
            <input max="1.8" min="0.7" onChange={(event) => setEvidenceScale(Number(event.target.value))} step="0.1" type="range" value={evidenceScale} />
          </label>
        </section>
      </aside>

      <section className="workbench">
        {activeView === "review" ? (
          <>
            <section className="review-console">
              <div className="graph-header">
                <div>
                  <h2>Selective Concept Memory</h2>
                  <p>Ask a student question. The system stores only concept-level signals.</p>
                </div>
                <button className="primary-action" onClick={runReview} type="button">
                  Analyze Signal
                </button>
              </div>
              <textarea
                className="question-box"
                value={studentQuestion}
                onChange={(event) => setStudentQuestion(event.target.value)}
                placeholder="What is confusing? Ask in English or Korean."
              />
              <div className="starter-row">
                {starterQuestions.map((item) => (
                  <button key={item} onClick={() => setStudentQuestion(item)} type="button">
                    {item}
                  </button>
                ))}
              </div>
            </section>

            {analysis && (
              <>
                <section className="analysis-panel">
                  <div className={`decision ${analysis.decision.toLowerCase()}`}>
                    <span>{analysis.decision}</span>
                    <strong>{analysis.signal}</strong>
                    <small>confidence {analysis.confidence.toFixed(2)}</small>
                  </div>
                  <div className="concept-strip">
                    {analysis.concepts.length ? (
                      analysis.concepts.map((concept) => (
                        <button key={concept.id} onClick={() => setSelectedId(concept.id)} type="button">
                          <span>S{concept.session}</span>
                          {concept.label}
                        </button>
                      ))
                    ) : (
                      <p>{analysis.ignoredReason}</p>
                    )}
                  </div>
                </section>
                <ReviewOutput analysis={analysis} onSelect={setSelectedId} />
              </>
            )}

            <section className="memory-dashboard">
              <div className="section-heading">
                <h2>Concept Memory Dashboard</h2>
                <p>Editable student state. No raw conversation transcript is required.</p>
              </div>
              <div className="memory-table">
                {memoryRows.slice(0, 18).map(({ concept, memory: item }) => (
                  <article className={`memory-row ${item.status}`} key={concept.id}>
                    <button className="memory-title" onClick={() => setSelectedId(concept.id)} type="button">
                      <span>S{concept.session}</span>
                      {concept.label}
                    </button>
                    <select value={item.status} onChange={(event) => updateMemory(concept.id, { status: event.target.value as MemoryStatus })}>
                      <option value="new">new</option>
                      <option value="confused">confused</option>
                      <option value="reviewing">reviewing</option>
                      <option value="known">known</option>
                    </select>
                    <label>
                      Strength
                      <input
                        max="1"
                        min="0"
                        onChange={(event) => updateMemory(concept.id, { strength: Number(event.target.value) })}
                        step="0.05"
                        type="range"
                        value={item.strength}
                      />
                    </label>
                    <input
                      className="memory-note"
                      onChange={(event) => updateMemory(concept.id, { note: event.target.value })}
                      placeholder="student note"
                      value={item.note}
                    />
                    <small>{item.encounters} signals, {item.confusionHits} confusion hits</small>
                  </article>
                ))}
              </div>
            </section>

            <section className="trace-panel">
              <div className="section-heading">
                <div>
                  <h2>STORE / UPDATE / IGNORE Log</h2>
                  <p>Only concept lists and decisions are retained.</p>
                </div>
                <button className="secondary-action" disabled={!traceLog.length} onClick={clearTraceLog} type="button">
                  Clear Log
                </button>
              </div>
              <div className="trace-list">
                {traceLog.length ? (
                  traceLog.slice(0, 6).map((trace) => (
                    <article key={trace.id}>
                      <span className={`trace-decision ${trace.decision.toLowerCase()}`}>{trace.decision}</span>
                      <p>{trace.question}</p>
                      <small>
                        {trace.signal} at {trace.timestamp}
                      </small>
                    </article>
                  ))
                ) : (
                  <div className="empty-log">No retained review decisions.</div>
                )}
              </div>
            </section>
          </>
        ) : (
          <>
            <div className="graph-header">
              <div>
                <h2>Course Ontology</h2>
                <p>{filteredConcepts.length} visible concepts, {filteredRelations.length} visible relations</p>
              </div>
              <button className="primary-action" onClick={createReviewPath} type="button">
                Build Review Path
              </button>
            </div>
            <ConceptGraph concepts={filteredConcepts} memory={memory} onSelect={setSelectedId} relations={filteredRelations} reviewPath={reviewPath} selectedId={selectedId} />
            {reviewPath.length > 0 && (
              <div className="review-path">
                {reviewPath.map((id, index) => {
                  const concept = conceptById.get(id);
                  if (!concept) return null;
                  return (
                    <button key={`${id}-${index}`} onClick={() => setSelectedId(id)} type="button">
                      <span>{index + 1}</span>
                      {concept.label}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      <aside className="detail-panel">
        {selected ? (
          <>
            <div className="concept-kicker">Session {selected.session}</div>
            <h2>{selected.label}</h2>
            <p className="definition">{selected.definition}</p>
            <div className="metric-row">
              <span>Importance {selected.importance.toFixed(2)}</span>
              <span className={selected.memoryPriority === "core" ? "memory core" : "memory"}>{selected.memoryPriority === "core" ? "Memory Candidate" : selected.memoryPriority}</span>
              {selectedMemory && <span className={`status-pill ${selectedMemory.status}`}>{selectedMemory.status}</span>}
            </div>

            {selectedMemory && (
              <section className="memory-editor">
                <h3>Student State</h3>
                <div className="status-buttons">
                  {(["new", "confused", "reviewing", "known"] as MemoryStatus[]).map((status) => (
                    <button
                      className={selectedMemory.status === status ? `active ${status}` : status}
                      key={status}
                      onClick={() => updateMemory(selected.id, { status })}
                      type="button"
                    >
                      {status}
                    </button>
                  ))}
                </div>
                <label>
                  Strength {selectedMemory.strength.toFixed(2)}
                  <input
                    max="1"
                    min="0"
                    onChange={(event) => updateMemory(selected.id, { strength: Number(event.target.value) })}
                    step="0.05"
                    type="range"
                    value={selectedMemory.strength}
                  />
                </label>
                <textarea
                  onChange={(event) => updateMemory(selected.id, { note: event.target.value })}
                  placeholder="Instructor or student can edit the concept memory directly."
                  value={selectedMemory.note}
                />
                <div className="memory-quick-actions">
                  <button onClick={() => updateMemory(selected.id, { status: "confused", strength: Math.max(0, selectedMemory.strength - 0.1), confusionHits: selectedMemory.confusionHits + 1 })} type="button">
                    Mark confused
                  </button>
                  <button onClick={() => updateMemory(selected.id, { status: "known", strength: Math.min(1, selectedMemory.strength + 0.15) })} type="button">
                    Mark known
                  </button>
                </div>
              </section>
            )}

            <section>
              <h3>Related Concept List</h3>
              <div className="connection-list">
                {connectedRelations.slice(0, 8).map((relation) => {
                  const neighborId = relation.source === selected.id ? relation.target : relation.source;
                  const neighbor = conceptById.get(neighborId);
                  if (!neighbor) return null;
                  return (
                    <button key={`${relation.source}-${relation.target}-${relation.type}`} onClick={() => setSelectedId(neighborId)} type="button">
                      <span>{relationLabels[relation.type]}</span>
                      {neighbor.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <h3>Evidence</h3>
            <div className="evidence-list">
                {selectedEvidence.map((item) => (
                  <article key={item.id}>
                    <strong>{item.sectionHeading}</strong>
                    <p>{item.excerpt}</p>
                    {item.visualPath && (
                      <figure className="evidence-visual">
                        <img alt={`${selected.label} visual evidence`} src={item.visualPath} />
                      </figure>
                    )}
                    {item.tablePreview && item.tablePreview.length > 0 && (
                      <div className="table-preview">
                        {item.tablePreview.map((line, index) => (
                          <code key={`${item.id}-${index}`}>{line}</code>
                        ))}
                      </div>
                    )}
                    <small>{item.sourceDocument} - {item.reference}</small>
                  </article>
                ))}
              </div>
            </section>

            <CriticalReview concept={selected} evidence={selectedEvidence[0]} relations={connectedRelations} />
          </>
        ) : (
          <div className="empty-detail">Select a concept to inspect its memory trace.</div>
        )}
      </aside>
    </main>
  );
}

function loadMemory(concepts: Concept[]): Record<string, ConceptMemory> {
  const stored = localStorage.getItem("cs471-concept-memory");
  const parsed = stored ? (JSON.parse(stored) as Record<string, ConceptMemory>) : {};
  return Object.fromEntries(
    concepts.map((concept) => [
      concept.id,
      parsed[concept.id] ?? {
        conceptId: concept.id,
        status: "new",
        strength: concept.memoryPriority === "core" ? 0.35 : 0.2,
        encounters: 0,
        confusionHits: 0,
        lastSignal: "initialized from course ontology",
        note: ""
      }
    ])
  );
}

function loadTraceLog(): ReviewTrace[] {
  const stored = localStorage.getItem("cs471-review-trace");
  if (!stored) return [];
  try {
    return JSON.parse(stored) as ReviewTrace[];
  } catch {
    return [];
  }
}

function analyzeQuestion(question: string, concepts: Concept[], memory: Record<string, ConceptMemory>): AnalysisResult {
  const normalized = question.toLowerCase();
  const confusionHits = confusionPatterns.filter((pattern) => normalized.includes(pattern));
  const scored = concepts
    .map((concept) => {
      const terms = [concept.label, ...concept.aliases].map((term) => term.toLowerCase());
      const directScore = terms.reduce((score, term) => score + (normalized.includes(term) ? 3 : 0), 0);
      const tokenScore = concept.label
        .toLowerCase()
        .split(/\W+/)
        .filter((token) => token.length > 3 && normalized.includes(token)).length;
      return { concept, score: directScore + tokenScore + concept.importance * 0.25 };
    })
    .filter((item) => item.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);

  if (!question.trim()) {
    return { decision: "IGNORE", signal: "empty input", confidence: 0, concepts: [], ignoredReason: "No student signal was provided." };
  }

  if (!scored.length) {
    return {
      decision: "IGNORE",
      signal: confusionHits.length ? "confusion without course concept match" : "no course concept match",
      confidence: 0.22,
      concepts: [],
      ignoredReason: "The question does not map cleanly to the current course ontology."
    };
  }

  const conceptsFound = scored.map((item) => item.concept);
  const hasKnownMemory = conceptsFound.some((concept) => (memory[concept.id]?.encounters ?? 0) > 0);
  const decision: MemoryDecision = confusionHits.length ? (hasKnownMemory ? "UPDATE" : "STORE") : hasKnownMemory ? "UPDATE" : "STORE";
  const signal = confusionHits.length ? `confusion signal: ${confusionHits.slice(0, 2).join(", ")}` : "concept mention without explicit confusion";
  const confidence = Math.min(0.96, 0.48 + scored[0].score / 8 + confusionHits.length * 0.08);

  return { decision, signal, confidence, concepts: conceptsFound };
}

function applyMemoryUpdate(current: Record<string, ConceptMemory>, result: AnalysisResult): Record<string, ConceptMemory> {
  const next = { ...current };
  const confused = result.signal.includes("confusion");
  result.concepts.forEach((concept) => {
    const prior = next[concept.id];
    const strengthDelta = confused ? -0.08 : 0.06;
    next[concept.id] = {
      ...prior,
      status: confused ? "confused" : prior.status === "confused" ? "reviewing" : "reviewing",
      strength: Math.max(0, Math.min(1, prior.strength + strengthDelta)),
      encounters: prior.encounters + 1,
      confusionHits: prior.confusionHits + (confused ? 1 : 0),
      lastSignal: result.signal
    };
  });
  return next;
}

function buildReviewPath(selectedId: string, relations: Relation[]) {
  const incoming = relations.filter((relation) => relation.type === "prerequisite_for" && relation.target === selectedId).map((relation) => relation.source);
  const outgoing = relations.filter((relation) => relation.source === selectedId && ["extends", "solves_problem_of"].includes(relation.type)).map((relation) => relation.target);
  return [...incoming.slice(0, 3), selectedId, ...outgoing.slice(0, 3)];
}

function evidenceForConcept(selectedId: string, relations: Relation[], evidenceById: Map<string, Evidence>) {
  if (!selectedId || !relations.length) return [];
  const ids = new Set<string>();
  relations.forEach((relation) => relation.evidenceIds.forEach((id) => ids.add(id)));
  return [...ids].map((id) => evidenceById.get(id)).filter(Boolean).slice(0, 4) as Evidence[];
}

function CriticalReview({ concept, evidence, relations }: { concept: Concept; evidence?: Evidence; relations: Relation[] }) {
  const contrast = relations.find((relation) => relation.type === "contrasts_with");
  return (
    <section className="critical-panel">
      <h3>Critical Note Check</h3>
      <article>
        <strong>Course statement to inspect</strong>
        <p>{evidence?.excerpt ?? concept.definition}</p>
      </article>
      <article>
        <strong>Hidden assumption</strong>
        <p>This statement may depend on whether the course is discussing optimization, representation, organization, or student memory.</p>
      </article>
      <article>
        <strong>Critical question</strong>
        <p>
          What evidence would make this concept less general, and does a contrasting concept
          {contrast ? " in the ontology limit the claim?" : " appear elsewhere in the ontology?"}
        </p>
      </article>
    </section>
  );
}

function ReviewOutput({ analysis, onSelect }: { analysis: AnalysisResult; onSelect: (id: string) => void }) {
  if (!analysis.concepts.length) {
    return (
      <section className="review-output">
        <div className="section-heading">
          <h2>Targeted Review Output</h2>
          <p>No memory update was made.</p>
        </div>
        <p>{analysis.ignoredReason}</p>
      </section>
    );
  }

  const primary = analysis.concepts[0];
  const supporting = analysis.concepts.slice(1, 4);
  return (
    <section className="review-output">
      <div className="section-heading">
        <h2>Targeted Review Output</h2>
        <p>Short answer, concept list, and next review action.</p>
      </div>
      <div className="review-answer">
        <strong>Short answer</strong>
        <p>
          Start with <button onClick={() => onSelect(primary.id)} type="button">{primary.label}</button>: {primary.definition}
          {supporting.length ? " Then compare it with the related concepts below instead of storing the whole conversation." : ""}
        </p>
      </div>
      <div className="review-next">
        <strong>Concepts to review</strong>
        <div className="concept-strip compact">
          {analysis.concepts.map((concept) => (
            <button key={concept.id} onClick={() => onSelect(concept.id)} type="button">
              <span>S{concept.session}</span>
              {concept.label}
            </button>
          ))}
        </div>
      </div>
      <div className="review-next">
        <strong>Next action</strong>
        <p>
          Open the first concept, inspect its evidence and figure/table, then mark the concept as confused, reviewing, or known in Student State.
        </p>
      </div>
    </section>
  );
}

function ConceptGraph({
  concepts,
  memory,
  relations,
  reviewPath,
  selectedId,
  onSelect
}: {
  concepts: Concept[];
  memory: Record<string, ConceptMemory>;
  relations: Relation[];
  reviewPath: string[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 620 });

  useEffect(() => {
    if (!wrapRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, []);

  const sessionsForGraph = useMemo(() => [...new Set(concepts.map((concept) => concept.session))].sort((a, b) => a - b), [concepts]);
  const canvasWidth = Math.max(size.width, sessionsForGraph.length * 230, 1480);
  const canvasHeight = Math.max(size.height, 620);

  const layout = useMemo(() => {
    const sessionBuckets = new Map<number, Concept[]>();
    concepts.forEach((concept) => {
      const bucket = sessionBuckets.get(concept.session) ?? [];
      bucket.push(concept);
      sessionBuckets.set(concept.session, bucket);
    });
    const positions = new Map<string, { x: number; y: number }>();
    const columnWidth = Math.max(210, canvasWidth / Math.max(1, sessionsForGraph.length));
    sessionsForGraph.forEach((session, sessionIndex) => {
      const bucket = sessionBuckets.get(session) ?? [];
      bucket.forEach((concept, conceptIndex) => {
        const x = columnWidth * sessionIndex + columnWidth / 2;
        const step = canvasHeight / (bucket.length + 1);
        const wave = Math.sin((conceptIndex + 1) * 1.7 + sessionIndex) * 22;
        positions.set(concept.id, { x, y: step * (conceptIndex + 1) + wave });
      });
    });
    return positions;
  }, [canvasHeight, canvasWidth, concepts, sessionsForGraph]);

  const pathIds = new Set(reviewPath);

  return (
    <div className="graph-wrap" ref={wrapRef}>
      <div className="graph-legend">
        <span><i className="legend-dot confused" /> confused</span>
        <span><i className="legend-dot reviewing" /> reviewing</span>
        <span><i className="legend-dot known" /> known</span>
      </div>
      <svg aria-label="Course ontology graph" role="img" style={{ height: canvasHeight, width: canvasWidth }} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
        <defs>
          <linearGradient id="nodeGlow" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.22)" />
          </linearGradient>
          <marker id="arrow" markerHeight="8" markerWidth="8" orient="auto-start-reverse" refX="7" refY="4">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="#7f8a9f" />
          </marker>
        </defs>
        {sessionsForGraph.map((session) => {
            const sessionConcepts = concepts.filter((concept) => concept.session === session);
            const points = sessionConcepts.map((concept) => layout.get(concept.id)).filter(Boolean) as { x: number; y: number }[];
            if (!points.length) return null;
            const minX = Math.min(...points.map((point) => point.x)) - 74;
            const minY = Math.min(...points.map((point) => point.y)) - 44;
            const maxX = Math.max(...points.map((point) => point.x)) + 74;
            const maxY = Math.max(...points.map((point) => point.y)) + 58;
            return (
              <g className="session-band" key={session}>
                <rect height={maxY - minY} rx="18" width={maxX - minX} x={minX} y={minY} />
                <text x={minX + 12} y={minY + 24}>SESSION {session}</text>
              </g>
            );
          })}
        {relations.map((relation) => {
          const source = layout.get(relation.source);
          const target = layout.get(relation.target);
          if (!source || !target) return null;
          const highlighted = pathIds.has(relation.source) && pathIds.has(relation.target);
          return (
            <g key={`${relation.source}-${relation.target}-${relation.type}`}>
              <line className={highlighted ? "edge highlighted" : `edge ${relation.type}`} markerEnd="url(#arrow)" x1={source.x} x2={target.x} y1={source.y} y2={target.y} />
            </g>
          );
        })}
        {concepts.map((concept) => {
          const position = layout.get(concept.id);
          if (!position) return null;
          const radius = 14 + concept.importance * 8;
          const selected = selectedId === concept.id;
          const fill = sessionPalette[(concept.session - 1) % sessionPalette.length];
          const status = memory[concept.id]?.status ?? "new";
          return (
            <g className="node-group" key={concept.id} onClick={() => onSelect(concept.id)} tabIndex={0}>
              <circle className={selected ? "node selected" : pathIds.has(concept.id) ? "node path" : `node ${status}`} cx={position.x} cy={position.y} fill={fill} r={radius} />
              <circle className="node-shine" cx={position.x - radius * 0.28} cy={position.y - radius * 0.28} r={radius * 0.36} />
              <text className="node-label" x={position.x} y={position.y + radius + 15}>
                {concept.label.length > 18 ? `${concept.label.slice(0, 16)}...` : concept.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
