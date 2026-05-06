import { ToolCallShell, type ToolCallStatus } from '../../primitives/tool-call-shell'
import { Mono } from '../../primitives/mono'
import type { IterationPartArgs } from '../../runtime/agent-message-parts'

const stateToStatus: Record<IterationPartArgs['state'], ToolCallStatus> = {
  running: 'running',
  passed: 'done',
  failed: 'error',
}

export type IterationStepProps = IterationPartArgs

export function IterationStep({
  n,
  subAgentDomain,
  selectionReason,
  state,
  scorerResults,
  usage,
}: IterationStepProps) {
  const defaultOpen = state === 'running' || state === 'failed'
  return (
    <ToolCallShell
      status={stateToStatus[state]}
      defaultOpen={defaultOpen}
      header={
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-foreground">
            <span className="text-muted-foreground/70">{n}.</span> {subAgentDomain}
          </span>
          <div className="flex-1" />
          {usage && <Mono>{usage.input_tokens + usage.output_tokens} tok</Mono>}
        </div>
      }
    >
      <div className="text-[0.625rem] text-muted-foreground/70">selection reason</div>
      <div className="font-mono text-xs text-foreground/90">{selectionReason}</div>
      {scorerResults && scorerResults.length > 0 && (
        <>
          <div className="mt-1 text-[0.625rem] text-muted-foreground/70">scorers</div>
          <div className="flex flex-col gap-0.5">
            {scorerResults.map((r) => (
              <div key={r.scorer} className="flex items-center gap-2 font-mono text-xs">
                <span className="text-foreground/80">{r.scorer}</span>
                <span className={r.passed ? 'text-emerald-400' : 'text-red-400'}>
                  {r.passed ? 'pass' : 'fail'}
                </span>
                {r.score !== undefined && (
                  <span className="text-muted-foreground/70">{r.score.toFixed(2)}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </ToolCallShell>
  )
}
