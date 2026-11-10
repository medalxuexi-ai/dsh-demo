export interface UserMessageParts {
  scene?: string;
  action?: string;
  expression?: string;
  dialogue?: string;
}

/**
 * Compose the structured composer fields into one user message.
 * A pure dialogue message stays natural (no labels); other combinations get
 * explicit section labels so the model can tell a stage direction from speech.
 */
export function composeUserMessage(parts: UserMessageParts): string {
  const entries: Array<[string, string]> = [];
  const scene = parts.scene?.trim();
  const action = parts.action?.trim();
  const expression = parts.expression?.trim();
  const dialogue = parts.dialogue?.trim();

  if (scene) entries.push(['场景', scene]);
  if (action) entries.push(['动作', action]);
  if (expression) entries.push(['神态', expression]);
  if (dialogue) entries.push(['对话', dialogue]);

  if (entries.length === 0) return '';
  if (entries.length === 1 && entries[0]![0] === '对话') return entries[0]![1];
  return entries.map(([label, text]) => `【${label}】${text}`).join('\n');
}
