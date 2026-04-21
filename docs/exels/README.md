# docs/exels — Project Plan content source

This folder is the **content source** for the Project Plan workbook. Each Markdown file maps 1:1 to a sheet in the final Excel workbook (`project-plan.xlsx`). The workbook is built manually by the PM; these files are the authored text, tables, and structured data to paste in.

The Project Plan is the single source of truth for scope, WBS, timeline, team, risks, and acceptance. It does not depend on or reference any external document to be read or acted on.

## Sheet index (matches spec §3.1)

| Order | Sheet              | File                    | Maps to PPTX |
| ----- | ------------------ | ----------------------- | ------------ |
| 1     | 00-Cover           | `00-Cover.md`           | Slide 1      |
| 2     | 00-TOC             | `00-TOC.md`             | Slide 2      |
| 3     | 01-Overview        | `01-Overview.md`        | Slides 3-5   |
| 4     | 02-Contract        | `02-Contract.md`        | Slides 6-7   |
| 5     | 03-Scope           | `03-Scope.md`           | Slides 8-10  |
| 6     | 04-Timeline        | `04-Timeline.md`        | Slides 11-12 |
| 7     | 05-Approach        | `05-Approach.md`        | Slides 13-23 |
| 8     | 06-Resources       | `06-Resources.md`       | Slide 17     |
| 9     | 07-DCA             | `07-DCA.md`             | Slide 24     |
| 10    | 08-Risks-Issues    | `08-Risks-Issues.md`    | Slides 25-26 |
| 11    | 09-ExecSupport     | `09-ExecSupport.md`     | Slide 27+    |
| 12    | Track-Planner      | `Track-Planner.md`      | —            |
| 13    | Track-CoreBackend  | `Track-CoreBackend.md`  | —            |
| 14    | Track-CoreFrontend | `Track-CoreFrontend.md` | —            |
| 15    | Track-CoreAIAgent  | `Track-CoreAIAgent.md`  | —            |

## How to use

1. Open `project-plan.xlsx` (or create it).
2. For each file in the order above, create a sheet with the matching name and paste the blocks in order. Narrative blocks → wrapped-text cells; tables → bordered tables with filter headers.
3. Apply the Status Legend colour key (on `04-Timeline`) to status cells across sheets.
4. After all 15 sheets are in, run these validation checks:
   - RACI integrity: exactly one Accountable per row on `06-Resources`.
   - WBS capacity sanity: sum of Effort High across all tasks per builder ≤ available MD over 8 weeks net of holiday deductions.
   - Hyperlinks on `00-TOC` resolve.
   - Holiday calendar populated on `04-Timeline` Block 5.
   - Every milestone on `02-Contract` Block 2 appears on `04-Timeline` Block 2 and in the relevant `Track-*` sprint plan.

## Key dates

- **Kickoff:** Wed 22 Apr 2026
- **VN public holidays (Sprint 1):** ~27 Apr – 1 May 2026 (~3 working days lost)
- **First Working Version:** W4 (Tue 19 May 2026)
- **Core AI Agent Phase 1 complete:** W4 (Tue 19 May 2026)
- **MVP Pilot-ready / Core AI Phase 2 complete:** W8 (Tue 16 Jun 2026)
- **Pilot gate:** W12 (Tue 14 Jul 2026)
- **Wave 1 → Full coverage:** TBD (post pilot-gate decision)
