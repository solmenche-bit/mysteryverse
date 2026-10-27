// Temporary placeholder used until a game module is implemented.
export function stubGame(meta) {
  return {
    ...meta,
    generationKind: null,
    curated: [],
    summarize: () => meta.title,
    start: () => ({ placeholder: true }),
    actions: {},
    hint: () => null,
    reveal: () => ({ answer: '', explanation: '' }),
    validate: () => ({ ok: false, problems: ['Not implemented yet'] }),
  };
}
