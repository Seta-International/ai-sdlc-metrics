# Phase 1 / Plan 1 — Tiptap Install

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the three Tiptap packages needed by Phase 1 (rich text editor + @mention extension).

**Architecture:** Package-only change. No code changes in this plan. Subsequent plans depend on these packages.

**Tech Stack:** `bun add`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-mention`

---

## Exit Criteria

- [ ] `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-mention` appear in `apps/web-planner/package.json` dependencies

---

## File Map

**Modify:** `apps/web-planner/package.json` (via bun add — never edit manually)

---

## Task 1: Install Tiptap packages

**Files:**

- Modify: `apps/web-planner/package.json` (via `bun add`)

- [ ] **Step 1: Install packages**

Run from the repo root (Turborepo workspace):

```bash
bun add --cwd apps/web-planner @tiptap/react @tiptap/starter-kit @tiptap/extension-mention
```

- [ ] **Step 2: Verify install succeeded**

```bash
grep "@tiptap" apps/web-planner/package.json
```

Expected output: three lines starting with `"@tiptap/react"`, `"@tiptap/starter-kit"`, `"@tiptap/extension-mention"` in the `dependencies` block.

- [ ] **Step 3: Commit**

```bash
git add apps/web-planner/package.json bun.lock
git commit -m "chore(web-planner): add Tiptap dependencies"
```
