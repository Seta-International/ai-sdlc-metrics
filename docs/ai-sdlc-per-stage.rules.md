# Context and rules — "How We Apply AI Across the SDLC"

Working notes for writing `ai-sdlc-per-stage.md`. Not part of the deliverable. Its job is to keep all six stages consistent in structure, voice, and evidence.

## Purpose

Show, stage by stage, how the Future team uses AI to build software, and where a human stays in control. It is a document to present and to walk through live, with real screenshots and files added as we go.

## Audience

BOD and engineering leads. Assume they are smart but not in the code. No jargon they would have to look up.

## What it is, and is not

- It is: a concrete account of how we work now, one feature at a time.
- It is not: a survey of the market, a maturity scorecard, or a pitch. Market research is used only to check our wording is accurate. It never appears as a section.
- It stands alone. Do not tell the reader to "see" another document. State the point here.

## Voice

Write like an engineer explaining the process to a new colleague. Plain and direct.

- Short sentences. One idea each. Prefer a period over a dash.
- Say the thing once. Do not restate it three ways for rhythm.
- Concrete over abstract: "the AI writes the failing test first", not "AI accelerates quality outcomes".
- Bold at most one or two terms in a section, or none. Bold is not decoration.
- Ban these words and moves: leverage, seamless, robust, powerful, load-bearing, unlock, the trick is, holds up, at its core, beating heart, game-changer, and strings of three adjectives.
- Present tense, active voice. "The engineer reviews", not "review is performed".
- If a sentence would survive being cut, cut it.

## Formatting

- No emoji. No icons. No circled numbers. Plain "1." for steps.
- Each stage fits on about half a page. If it runs longer, something is padding.
- Headings per stage are fixed and in this order (see template).
- Tables only for the two-column "who does what". Everything else is prose or a short list.

## Per-stage template

Every stage uses exactly these headings, in order:

```
## Stage N — <name>

### Goal
One or two sentences: what this stage produces and the standard it must meet.

### Flow (input to output)
One diagram (rules below). Skip only if the stage has no real handoff.

### How we use AI
The real loop as a numbered list (3–6 steps). At most one short paragraph after it
for the single most important point. No more.

### Who does what
A two-column table: AI | Human. Four rows or fewer.

### Output
One or two sentences: what exists at the end, and where it goes next.

### Recorded for measurement
One or two sentences, or up to three short bullets: what signal this stage emits.

### Evidence (shown live)
Bracketed slots for the walkthrough, e.g. [evidence: the prompt and the tickets it produced].
```

**Exception — Agentic Coding.** That stage adds one subsection, `### The harness`, after the flow: what context loads (CLAUDE.md every turn versus docs pulled on demand) and the gate stack the output must clear (types, tests, format, lint, module/DDD boundaries, no cross-schema SQL, branch and commit rules, budgets) before a human sees it. The harness is the point of agentic coding, so it earns its own subsection there.

## Diagram rules

- Default to a sequence diagram when the stage is a back-and-forth between a person and the AI. It shows the actors and the order without the layout turning to noise.
- Participants are only things that act: the person (Engineer / PO), the AI agent, and a system that receives an action (for example Jira).
- Number the steps and match the "How we use AI" list one to one.
- Plain labels. No emoji. Write "and", not "&".
- Render it (mermaid-cli pointed at the system Chrome) and look at the image before it goes in. A diagram that does not render, or where the order is not obvious, does not go in.

Mistakes to avoid (learned on Stage 1):

- Do not give an artifact or a storage system its own lane next to real actors. A "Docs / Jira" lane that holds both the input brief and the output tickets mixes actor with flow and reads as noise.
- Do not merge two different sources into one node. A Confluence page and a markdown file in the repo are different places. Name the one we actually use, or make the brief an action and leave storage out of the picture.
- Do not use a lane flowchart for a conversation. If the flow is a person and the AI handing work back and forth, a sequence diagram is clearer than swimlanes with arrows crossing between lanes.

## Grounding

- Every claim maps to something real in our setup. If we cannot show it, we do not claim it.
- Mark the current state honestly. If a stage is partly manual, say so in one plain line.
- Put a real artifact behind each evidence slot when one exists.

## Done check for a stage

- [ ] Uses the exact template headings, in order.
- [ ] Fits about half a page.
- [ ] No emoji, minimal bold, none of the banned words.
- [ ] Diagram renders and shows the human gate.
- [ ] Every claim is something we could show on screen.
