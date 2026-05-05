# Phase 1 — Frontend Implementation Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each sub-plan task-by-task.

**Goal:** Convert the single-scroll read-only task detail panel into a 4-tab panel (Details / Checklist / Files / Chat) where every property field is inline-editable, and replace the plain textarea description with a Tiptap rich-text editor.

**Architecture:** Pure frontend refactor — zero backend changes. `TaskDetailPanel.tsx` is rebuilt around `<Tabs>` from `@future/ui`. New picker components live in `src/components/pickers/`. Field wrappers in `src/components/task-detail/fields/` wire pickers to existing tRPC mutations. All six legacy task-detail files are deleted after replacements are stable.

**Tech Stack:** Next.js (App Router), React, `@future/ui` Tabs/Popover/Button, `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-mention`, Vitest + Testing Library, tRPC (no new procedures)

---

## Sub-Plans

Execute in order — each plan builds on the previous.

| #   | Plan file                                                            | Tasks       | Deliverable                                                      |
| --- | -------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------- |
| 1   | [phase-1/1-tiptap-install.md](phase-1/1-tiptap-install.md)           | Task 1      | Tiptap npm install                                               |
| 2   | [phase-1/2-pickers.md](phase-1/2-pickers.md)                         | Tasks 2–5   | PriorityPicker, ProgressPicker, DatePicker, BucketPicker         |
| 3   | [phase-1/3-fields-and-richtext.md](phase-1/3-fields-and-richtext.md) | Tasks 6–8   | RichTextDescription, 6 field wrappers, TaskDetailTab             |
| 4   | [phase-1/4-tab-components.md](phase-1/4-tab-components.md)           | Tasks 9–11  | TaskChecklistTab, TaskFilesTab, TaskChatTab                      |
| 5   | [phase-1/5-panel-assembly.md](phase-1/5-panel-assembly.md)           | Tasks 12–15 | TaskPanelHeader, TaskDetailPanel refactor, delete dead files, PR |

---

## Exit Criteria (Full Phase 1)

- [ ] Panel renders 4 tabs: Details / Checklist / Files / Chat — badges show counts
- [ ] All 7 property fields in Details tab open a picker on click; mutations fire on selection
- [ ] Description renders and saves HTML via Tiptap (bold, italic, underline, code)
- [ ] Chat tab @mention suggests plan members; `@Name` inserted in comment body
- [ ] ConflictBanner visible above tabs regardless of active tab
- [ ] `TaskPropertyStrip.tsx`, `TaskDescription.tsx`, `TaskComments.tsx`, `TaskChecklist.tsx`, `TaskAttachments.tsx`, `TaskEvidence.tsx` deleted
- [ ] `bun run test --filter @future/web-planner` passes with ≥70% coverage
- [ ] No `window.*`, `localStorage.*`, or `sessionStorage.*` reads in component bodies
- [ ] All interactive elements use `@future/ui` primitives; no raw `<button>/<input>/<textarea>`
- [ ] History icon visible in panel header, disabled (Phase 2 wires it)
