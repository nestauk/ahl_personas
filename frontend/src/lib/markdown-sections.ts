/** Blocks opened by default in an expanded report. */
export const DEFAULT_OPEN = /benefits and harms|who benefits most/i;

/**
 * Split markdown into `###` blocks. Text before the first `###` comes back
 * with an empty heading. Headings inside fenced code are not special-cased.
 */
// ponytail: line-based split, ignores ``` fences; report prompts never emit them.
export function splitByH3(md: string): { heading: string; body: string }[] {
  const blocks: { heading: string; body: string }[] = [{ heading: "", body: "" }];
  for (const line of md.split("\n")) {
    const m = line.match(/^###\s+(.*)$/);
    if (m) blocks.push({ heading: m[1].trim(), body: "" });
    else blocks[blocks.length - 1].body += line + "\n";
  }
  if (!blocks[0].body.trim()) blocks.shift();
  return blocks;
}
