#!/usr/bin/env python3
"""Generate the cached ontology used by the CS471 prototype.

The default path is deterministic and offline. If a vLLM OpenAI-compatible
endpoint is configured later, this file is the integration point for replacing
or enriching the curated concept graph before writing public/ontology.json.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import textwrap
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output"
PUBLIC = ROOT / "public"
VISUALS = PUBLIC / "visuals"
ONTOLOGY_PATH = PUBLIC / "ontology.json"


@dataclass(frozen=True)
class ConceptSeed:
    id: str
    label: str
    session: int
    aliases: tuple[str, ...]
    definition: str
    importance: float
    memory_priority: str


@dataclass(frozen=True)
class RelationSeed:
    source: str
    target: str
    type: str
    confidence: float


CONCEPTS = [
    ConceptSeed("credit-assignment", "Credit Assignment", 1, ("assigning credit",), "Evaluating which actions, beliefs, or structures deserve credit for progress toward a goal.", 1.0, "core"),
    ConceptSeed("intermediate-feedback", "Intermediate Feedback", 1, ("proxies", "feedback"), "A proxy signal used before final outcomes are available so agents can evaluate actions while learning.", 0.96, "core"),
    ConceptSeed("reinforcement-learning", "Reinforcement Learning", 1, ("reinforcement", "rewards"), "A learning paradigm that reinforces actions according to feedback about rewards.", 0.92, "core"),
    ConceptSeed("exploration-exploitation", "Exploration-Exploitation", 1, ("exploration", "exploitation"), "The tradeoff between trying new beliefs or actions and relying on what prior feedback has supported.", 0.88, "core"),
    ConceptSeed("temporal-differencing", "Temporal Differencing", 1, ("TD", "value function"), "A reinforcement strategy that updates value estimates using feedback across different moments in time.", 0.82, "supporting"),
    ConceptSeed("learning-in-society", "Learning in a Society", 1, ("society of mind", "management hypothesis"), "A paradigm where intelligence comes from decomposing problems and coordinating many specialized agents.", 0.94, "core"),
    ConceptSeed("information-processing", "Information Processing", 2, ("syntactic information", "semantic information"), "A view of intelligence as transforming information under limits of capacity, abstraction, and context.", 0.9, "core"),
    ConceptSeed("channel-capacity", "Channel Capacity", 2, ("limited channel capacity", "bits"), "A constraint on how much syntactic information can be transmitted or processed.", 0.72, "supporting"),
    ConceptSeed("semantic-abstraction", "Semantic Abstraction", 2, ("lists", "abstractions"), "Meaningful grouping of information into concepts or lists that reduce problem complexity.", 0.82, "core"),
    ConceptSeed("modularity", "Modularity", 2, ("modules",), "A way to handle complexity by decomposing information processing into separable parts.", 0.76, "supporting"),
    ConceptSeed("iid-ood", "IID vs OOD", 2, ("out-of-distribution", "IID"), "The contrast between stable repeated information environments and settings where learned assumptions fail.", 0.7, "supporting"),
    ConceptSeed("search", "Search", 3, ("search space", "state space"), "Problem solving by exploring possible states, actions, or plans.", 0.88, "core"),
    ConceptSeed("plans", "Plans", 3, ("programs", "division of labor"), "Structured sequences that divide problem-solving work into executable procedures.", 0.84, "core"),
    ConceptSeed("heuristics", "Heuristics", 3, ("rules of thumb", "educated guesses"), "Rules that guide search while economizing on time, attention, and computational cost.", 0.86, "core"),
    ConceptSeed("satisficing", "Satisficing", 3, ("satisfice",), "Choosing a good-enough solution when exhaustive optimization is impossible or too costly.", 0.84, "core"),
    ConceptSeed("means-ends-analysis", "Means-Ends Analysis", 3, ("GPS", "General Problem Solver"), "A search strategy that reduces the gap between current state and goal state.", 0.78, "supporting"),
    ConceptSeed("evolutionary-strategies", "Evolutionary Strategies", 4, ("evolution", "adaptation"), "Learning strategies inspired by variation, selection, and adaptation on performance landscapes.", 0.86, "core"),
    ConceptSeed("performance-landscape", "Performance Landscape", 4, ("landscape", "fitness landscape"), "A representation of how combinations of choices map to performance.", 0.9, "core"),
    ConceptSeed("hill-climbing", "Hill Climbing", 4, ("gradient descent",), "A local search process that improves performance by moving uphill on a landscape.", 0.76, "supporting"),
    ConceptSeed("rugged-landscape", "Rugged Landscape", 4, ("rugged landscapes",), "A landscape with many peaks that makes local adaptation likely to get stuck.", 0.74, "supporting"),
    ConceptSeed("representation", "Representation", 5, ("representations",), "An external or internal structure that constrains and enables problem solving.", 0.92, "core"),
    ConceptSeed("constraint-network", "Constraint Network", 5, ("constraints", "constraint networks"), "A representation where information propagates across constraints among variables.", 0.9, "core"),
    ConceptSeed("constraint-satisfaction", "Constraint Satisfaction", 5, ("CSP", "satisfying constraints"), "Solving by finding assignments that satisfy a network of constraints.", 0.82, "supporting"),
    ConceptSeed("causal-nets", "Causal Nets", 5, ("causal networks",), "Constraint networks that represent causal structure rather than mere correlation.", 0.78, "supporting"),
    ConceptSeed("deep-learning", "Deep Learning", 5, ("neural nets", "Boltzmann machines"), "A data-driven representation strategy that learns statistical structure across many examples.", 0.76, "context"),
    ConceptSeed("krr", "Knowledge Representation and Reasoning", 6, ("KRR", "knowledge representation"), "Representing knowledge explicitly enough that a system can reason with it.", 0.94, "core"),
    ConceptSeed("advice-taker", "Advice Taker", 6, ("McCarthy",), "McCarthy's vision of an AI system that can accept declarative knowledge and reason from it.", 0.78, "supporting"),
    ConceptSeed("frame-problem", "Frame Problem", 6, ("frames",), "The challenge of knowing what changes and what stays the same when actions occur.", 0.86, "core"),
    ConceptSeed("default-reasoning", "Default Reasoning", 6, ("defaults",), "Reasoning with defeasible commonsense assumptions when complete certainty is unavailable.", 0.82, "core"),
    ConceptSeed("elaboration-tolerance", "Elaboration Tolerance", 6, ("elaboration",), "The ability to add or remove facts and concepts without making the knowledge base harder to use.", 0.96, "core"),
    ConceptSeed("interaction", "Interaction", 7, ("interactionism",), "A view that intelligence depends on acting in and responding to concrete situations.", 0.88, "core"),
    ConceptSeed("situatedness", "Situatedness", 7, ("situated",), "The idea that intelligent action depends on the current situation rather than abstract representation alone.", 0.78, "supporting"),
    ConceptSeed("embodiment", "Embodiment", 7, ("embodied",), "The way physical action and bodily limits shape what intelligence can do.", 0.72, "supporting"),
    ConceptSeed("subsumption-architecture", "Subsumption Architecture", 7, ("Brooks",), "A layered behavior architecture where simple sensorimotor routines support more complex action.", 0.76, "supporting"),
    ConceptSeed("debugging", "Debugging", 8, ("generate-test-debug", "troubleshooting"), "A problem-solving process that identifies and repairs failures in a system or theory.", 0.9, "core"),
    ConceptSeed("first-principles", "First Principles Reasoning", 8, ("first principles",), "Reasoning from basic mechanisms rather than surface correlations.", 0.82, "core"),
    ConceptSeed("qualitative-reasoning", "Qualitative Reasoning", 8, ("qualitative information",), "Reasoning about physical systems using rough directional and relational knowledge.", 0.78, "supporting"),
    ConceptSeed("truth-maintenance", "Truth Maintenance", 8, ("TMS", "dependency networks"), "Tracking dependencies among beliefs so revisions can be directed when assumptions fail.", 0.86, "core"),
    ConceptSeed("aggregation", "Aggregation", 9, ("aggregating information",), "Combining information or judgments from multiple agents, models, or sources.", 0.88, "core"),
    ConceptSeed("pandemonium", "Pandemonium", 9, ("Selfridge",), "A competitive multi-agent pattern recognition architecture.", 0.68, "context"),
    ConceptSeed("blackboard-system", "Blackboard System", 9, ("blackboard", "knowledge sources"), "A cooperative architecture where specialized agents update and reason over shared state.", 0.82, "core"),
    ConceptSeed("ensemble-methods", "Ensemble Methods", 9, ("wisdom of the crowd",), "Combining multiple models or judgments so errors can cancel out.", 0.76, "supporting"),
    ConceptSeed("due-process", "Due Process", 9, ("peer review", "reasonableness"), "A procedural criterion for assigning credit when information is inconsistent.", 0.78, "core"),
    ConceptSeed("actor-model", "Actor Model", 9, ("actors", "pure messaging"), "A model of concurrent computation based on autonomous actors communicating through messages.", 0.74, "supporting"),
]


RELATIONS = [
    RelationSeed("credit-assignment", "intermediate-feedback", "solves_problem_of", 0.94),
    RelationSeed("intermediate-feedback", "reinforcement-learning", "part_of", 0.86),
    RelationSeed("reinforcement-learning", "exploration-exploitation", "part_of", 0.9),
    RelationSeed("reinforcement-learning", "temporal-differencing", "extends", 0.84),
    RelationSeed("reinforcement-learning", "learning-in-society", "contrasts_with", 0.92),
    RelationSeed("credit-assignment", "information-processing", "prerequisite_for", 0.9),
    RelationSeed("information-processing", "channel-capacity", "part_of", 0.78),
    RelationSeed("information-processing", "semantic-abstraction", "part_of", 0.82),
    RelationSeed("semantic-abstraction", "modularity", "solves_problem_of", 0.78),
    RelationSeed("information-processing", "iid-ood", "extends", 0.72),
    RelationSeed("credit-assignment", "search", "prerequisite_for", 0.9),
    RelationSeed("plans", "search", "part_of", 0.8),
    RelationSeed("search", "heuristics", "part_of", 0.88),
    RelationSeed("heuristics", "satisficing", "solves_problem_of", 0.84),
    RelationSeed("satisficing", "means-ends-analysis", "part_of", 0.76),
    RelationSeed("search", "evolutionary-strategies", "contrasts_with", 0.7),
    RelationSeed("evolutionary-strategies", "performance-landscape", "part_of", 0.9),
    RelationSeed("performance-landscape", "hill-climbing", "part_of", 0.82),
    RelationSeed("performance-landscape", "rugged-landscape", "part_of", 0.78),
    RelationSeed("rugged-landscape", "hill-climbing", "contrasts_with", 0.72),
    RelationSeed("performance-landscape", "representation", "prerequisite_for", 0.68),
    RelationSeed("representation", "constraint-network", "part_of", 0.9),
    RelationSeed("constraint-network", "constraint-satisfaction", "part_of", 0.86),
    RelationSeed("constraint-network", "causal-nets", "part_of", 0.76),
    RelationSeed("constraint-network", "deep-learning", "contrasts_with", 0.72),
    RelationSeed("representation", "krr", "prerequisite_for", 0.88),
    RelationSeed("krr", "advice-taker", "example_of", 0.82),
    RelationSeed("krr", "frame-problem", "solves_problem_of", 0.88),
    RelationSeed("default-reasoning", "elaboration-tolerance", "solves_problem_of", 0.9),
    RelationSeed("frame-problem", "elaboration-tolerance", "extends", 0.74),
    RelationSeed("krr", "interaction", "contrasts_with", 0.72),
    RelationSeed("interaction", "situatedness", "part_of", 0.86),
    RelationSeed("interaction", "embodiment", "part_of", 0.78),
    RelationSeed("interaction", "subsumption-architecture", "example_of", 0.82),
    RelationSeed("interaction", "debugging", "prerequisite_for", 0.64),
    RelationSeed("debugging", "first-principles", "part_of", 0.84),
    RelationSeed("debugging", "qualitative-reasoning", "part_of", 0.84),
    RelationSeed("debugging", "truth-maintenance", "part_of", 0.88),
    RelationSeed("truth-maintenance", "aggregation", "prerequisite_for", 0.66),
    RelationSeed("aggregation", "pandemonium", "example_of", 0.76),
    RelationSeed("aggregation", "blackboard-system", "example_of", 0.84),
    RelationSeed("aggregation", "ensemble-methods", "example_of", 0.82),
    RelationSeed("aggregation", "due-process", "solves_problem_of", 0.78),
    RelationSeed("aggregation", "actor-model", "extends", 0.76),
    RelationSeed("learning-in-society", "blackboard-system", "extends", 0.8),
]


def clean_text(value: str) -> str:
    value = re.sub(r"<!--.*?-->", " ", value, flags=re.S)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def visual_for(concept: ConceptSeed) -> str | None:
    VISUALS.mkdir(exist_ok=True)
    candidates = []
    for source in ("Course Notes", "Slides"):
        figure_dir = OUTPUT / f"{source}_{concept.session}" / "figures"
        layout_dir = OUTPUT / f"{source}_{concept.session}" / "layout"
        candidates.extend(sorted(figure_dir.glob("*.png"))[:2])
        candidates.extend(sorted(layout_dir.glob("page_*_preview.png"))[:1])
    if not candidates:
        return None
    source_path = candidates[0]
    safe_name = f"{source_path.parents[1].name.replace(' ', '_')}_{source_path.name}"
    target_path = VISUALS / safe_name
    if not target_path.exists():
        shutil.copy2(source_path, target_path)
    return f"/visuals/{safe_name}"


def table_preview_for(session: int, terms: Iterable[str]) -> list[str]:
    path = document_path(session, "Course Notes")
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    blocks: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if line.strip().startswith("|") and "|" in line.strip()[1:]:
            current.append(line.strip())
        elif current:
            if len(current) >= 2:
                blocks.append(current)
            current = []
    if current and len(current) >= 2:
        blocks.append(current)
    if not blocks:
        return []
    lowered_terms = [term.lower() for term in terms]
    scored = []
    for block in blocks:
        joined = " ".join(block).lower()
        score = sum(joined.count(term) for term in lowered_terms)
        scored.append((score, block))
    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1][:6]


def document_path(session: int, source: str = "Course Notes") -> Path:
    return OUTPUT / f"{source}_{session}" / "markdown" / "paper.md"


def split_sections(path: Path) -> list[tuple[str, str]]:
    if not path.exists():
        return []
    raw = path.read_text(encoding="utf-8", errors="ignore")
    parts: list[tuple[str, str]] = []
    current_heading = path.parent.parent.name
    current_lines: list[str] = []
    for line in raw.splitlines():
        if line.startswith("## "):
            if current_lines:
                parts.append((current_heading, clean_text(" ".join(current_lines))))
            current_heading = clean_text(line.lstrip("# "))
            current_lines = []
        else:
            current_lines.append(line)
    if current_lines:
        parts.append((current_heading, clean_text(" ".join(current_lines))))
    return [(heading, body) for heading, body in parts if body]


def score_section(body: str, terms: Iterable[str]) -> int:
    lowered = body.lower()
    return sum(lowered.count(term.lower()) for term in terms)


def excerpt_for(concept: ConceptSeed) -> dict:
    candidates = []
    terms = (concept.label, *concept.aliases)
    for source in ("Course Notes", "Slides"):
        path = document_path(concept.session, source)
        for heading, body in split_sections(path):
            score = score_section(f"{heading} {body}", terms)
            if score:
                candidates.append((score, source, path, heading, body))
    if not candidates:
        path = document_path(concept.session, "Course Notes")
        sections = split_sections(path)
        if sections:
            heading, body = sections[0]
            candidates.append((0, "Course Notes", path, heading, body))

    _, source, path, heading, body = sorted(candidates, key=lambda item: item[0], reverse=True)[0]
    excerpt = textwrap.shorten(body, width=290, placeholder="...")
    return {
        "sourceDocument": f"{source}_{concept.session}",
        "sectionHeading": heading,
        "excerpt": excerpt,
        "reference": f"Session {concept.session}",
        "sourcePath": str(path.relative_to(ROOT)),
        "visualPath": visual_for(concept),
        "tablePreview": table_preview_for(concept.session, terms),
    }


def relation_evidence_id(source: ConceptSeed, target: ConceptSeed) -> str:
    return f"ev-{source.id}-{target.id}"


def build_offline_ontology() -> dict:
    concept_by_id = {concept.id: concept for concept in CONCEPTS}
    concept_evidence = {concept.id: excerpt_for(concept) for concept in CONCEPTS}

    evidence = []
    relations = []
    for relation in RELATIONS:
        source = concept_by_id[relation.source]
        target = concept_by_id[relation.target]
        preferred = concept_evidence[source.id]
        if target.session == source.session and len(target.label) > len(source.label):
            preferred = concept_evidence[target.id]
        evidence_id = relation_evidence_id(source, target)
        evidence.append({"id": evidence_id, **preferred})
        relations.append(
            {
                "source": relation.source,
                "target": relation.target,
                "type": relation.type,
                "confidence": relation.confidence,
                "evidenceIds": [evidence_id],
            }
        )

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "model": "offline curated cache; vLLM target: gpt-oss-120b",
        "concepts": [
            {
                "id": concept.id,
                "label": concept.label,
                "aliases": list(concept.aliases),
                "session": concept.session,
                "definition": concept.definition,
                "importance": concept.importance,
                "memoryPriority": concept.memory_priority,
            }
            for concept in CONCEPTS
        ],
        "relations": relations,
        "evidence": evidence,
    }


def session_digest(session: int) -> str:
    chunks = []
    for source in ("Course Notes", "Slides"):
        path = document_path(session, source)
        headings = [heading for heading, _ in split_sections(path)[:12]]
        if headings:
            chunks.append(f"{source}_{session}: " + "; ".join(headings))
    return "\n".join(chunks)


def try_vllm_quality_pass(ontology: dict) -> dict:
    """Optionally ask vLLM to polish definitions.

    This keeps the public schema and deterministic graph stable while allowing a
    local gpt-oss-120b server to improve wording before the cache is written.
    """
    base_url = os.getenv("VLLM_BASE_URL")
    use_vllm = os.getenv("USE_VLLM_ONTOLOGY", "").lower() in {"1", "true", "yes"}
    if not base_url or not use_vllm:
        return ontology

    model = os.getenv("VLLM_MODEL", "gpt-oss-120b")
    endpoint = base_url.rstrip("/") + "/v1/chat/completions"
    concepts = [
        {
            "id": concept["id"],
            "label": concept["label"],
            "session": concept["session"],
            "definition": concept["definition"],
        }
        for concept in ontology["concepts"]
    ]
    prompt = {
        "task": "Polish concise course ontology definitions without changing ids, labels, sessions, or JSON shape.",
        "constraints": [
            "Return JSON only.",
            "Use one sentence per definition.",
            "Ground wording in the supplied session headings.",
            "Do not invent new concepts.",
        ],
        "session_headings": {str(session): session_digest(session) for session in range(1, 10)},
        "concepts": concepts,
    }
    body = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": "You are a careful ontology extraction assistant for a university course."},
                {"role": "user", "content": json.dumps(prompt)},
            ],
            "temperature": 0.1,
        }
    ).encode("utf-8")
    request = urllib.request.Request(endpoint, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = json.loads(response.read().decode("utf-8"))
        content = payload["choices"][0]["message"]["content"]
        polished = json.loads(content)
        by_id = {item["id"]: item for item in polished.get("concepts", [])}
        for concept in ontology["concepts"]:
            new_definition = by_id.get(concept["id"], {}).get("definition")
            if isinstance(new_definition, str) and 40 <= len(new_definition) <= 220:
                concept["definition"] = new_definition
        ontology["model"] = f"vLLM quality pass: {model}; cached static JSON"
        print(f"Applied vLLM quality pass with {model}")
    except (KeyError, json.JSONDecodeError, TimeoutError, urllib.error.URLError) as exc:
        print(f"vLLM quality pass skipped: {exc}")
    return ontology


def main() -> None:
    PUBLIC.mkdir(exist_ok=True)
    ontology = try_vllm_quality_pass(build_offline_ontology())
    ONTOLOGY_PATH.write_text(json.dumps(ontology, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {ONTOLOGY_PATH.relative_to(ROOT)}")
    print(f"{len(ontology['concepts'])} concepts, {len(ontology['relations'])} relations, {len(ontology['evidence'])} evidence clips")


if __name__ == "__main__":
    main()
