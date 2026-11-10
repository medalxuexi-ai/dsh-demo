export interface MacroContext {
  char: string;
  user?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  now?: Date;
}

const MACRO_RE = /\{\{\s*([a-zA-Z0-9_:]+)\s*\}\}/g;

function valueFor(name: string, ctx: MacroContext): string | undefined {
  const now = ctx.now ?? new Date();
  switch (name.toLowerCase()) {
    case 'char':
      return ctx.char;
    case 'user':
      return ctx.user || '你';
    case 'description':
      return ctx.description ?? '';
    case 'personality':
      return ctx.personality ?? '';
    case 'scenario':
      return ctx.scenario ?? '';
    case 'time':
      return now.toLocaleTimeString('zh-CN', { hour12: false });
    case 'date':
      return now.toLocaleDateString('zh-CN');
    default:
      return undefined;
  }
}

export interface MacroExpansion {
  text: string;
  unknown: string[];
}

/** Expand known macros; unknown macros are preserved and reported. */
export function expandMacros(input: string, ctx: MacroContext): MacroExpansion {
  const unknown: string[] = [];
  const text = input.replace(MACRO_RE, (whole, name: string) => {
    const value = valueFor(name, ctx);
    if (value === undefined) {
      unknown.push(name);
      return whole;
    }
    return value;
  });
  return { text, unknown };
}
