# Teams Mock Chart Card — Design

## Summary

Add a "show chart" command to `mockTeamsHandler` that renders a pie/donut chart of mock project progress using Adaptive Cards v1.6 native `Chart.Donut`.

## Architecture

No new packages or dependencies. Follows the existing pattern in `modules/channels/teams/src/`:

- New card builder: `cards/mock-chart.ts` → `buildMockChartCard(): OutboundActivity`
- Updated handler: `mock-handler.ts` adds one regex branch
- Updated tests: `mock-handler.test.ts` adds two new test cases

## Card Structure

Adaptive Card v1.6, `contentType: application/vnd.microsoft.card.adaptive`:

```
body:
  - TextBlock "Project Progress" (Bolder, Medium)
  - Chart.Donut
      data:
        - Atlas      75%
        - Phoenix    40%
        - Internal   20%
```

No actions needed — chart is read-only.

## Handler Trigger

Regex: `/show.*chart|chart.*progress/` on lowercased, trimmed `activity.text`.

Fallback message updated to include `'show chart'` as a recognised command.

## Testing

| Input | Expected |
|---|---|
| `"show chart"` | message with 1 adaptive card attachment, body contains `Chart.Donut` element |
| `"show project chart"` | same |
| `"hello"` | fallback text includes `'show chart'` |

## Constraints

- Adaptive Cards v1.6 `Chart.Donut` is a first-class Teams element but support varies by client version. Acceptable for a mock/dev handler.
- No external URLs, no new deps.
- Mock data only — no real connector calls.
