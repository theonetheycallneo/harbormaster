/**
 * Paragraph-aware chunking: split on blank lines, pack paragraphs into
 * ~TARGET-char chunks with OVERLAP chars of trailing context carried into
 * the next chunk. Oversized single paragraphs are hard-split.
 */
const TARGET = 1200;
const OVERLAP = 150;

export function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = current.slice(-OVERLAP);
  };

  for (const p of paragraphs) {
    if (p.length > TARGET) {
      flush();
      for (let i = 0; i < p.length; i += TARGET - OVERLAP) {
        chunks.push(p.slice(i, i + TARGET).trim());
      }
      current = "";
      continue;
    }
    if (current.length + p.length + 2 > TARGET) flush();
    current = current ? `${current}\n\n${p}` : p;
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.filter((c) => c.length > 0);
}
