export interface PreviewCardInput {
  title: string
  summary: string
  facts: Array<{ title: string; value: string }>
  verb: string
  token: string
  ttlMinutes: number
}

export function buildPreviewCard(i: PreviewCardInput): Record<string, unknown> {
  const cancelVerb = i.verb.replace(/\.commit$/, '.cancel')
  return {
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      {
        type: 'TextBlock',
        text: i.title,
        size: 'Large',
        weight: 'Bolder',
      },
      {
        type: 'TextBlock',
        text: i.summary,
        wrap: true,
      },
      {
        type: 'FactSet',
        facts: i.facts.map((f) => ({ title: f.title, value: f.value })),
      },
      {
        type: 'TextBlock',
        text: `Confirmation expires in ${i.ttlMinutes} minutes`,
        size: 'Small',
        isSubtle: true,
      },
    ],
    actions: [
      {
        type: 'Action.Execute',
        title: 'Confirm',
        style: 'positive',
        verb: i.verb,
        data: { token: i.token },
      },
      {
        type: 'Action.Execute',
        title: 'Cancel',
        verb: cancelVerb,
        data: { token: i.token },
      },
    ],
  }
}
