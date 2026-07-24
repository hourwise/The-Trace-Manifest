/**
 * Deterministic parsing for the TRACE knowledge Markdown format.
 *
 * This parser only identifies editor-authored material statements and source
 * URLs. It does not decide whether a claim is true, admit a source, or create
 * a canonical claim. Those actions remain review-gated later in KC-08.
 */

export type KnowledgeClaimRelationship =
  | "answers"
  | "supports"
  | "qualifies"
  | "contradicts"
  | "contextualises"
  | "inference_basis";

export interface KnowledgeMarkdownFrontmatter {
  canonical_question?: string;
  section?: string;
  topics?: string[];
  knowledge_type?: string;
  evidence_status?: string;
  valid_from?: string;
  review_after?: string;
  hard_expiry?: string;
  source_set_hash?: string;
  [key: string]: string | string[] | undefined;
}

export interface KnowledgeMarkdownSection {
  key: string;
  title: string;
  body: string;
  startLine: number;
  endLine: number;
}

export interface KnowledgeMarkdownEvidenceUrl {
  url: string;
  name: string;
  description: string;
  sectionKey: string;
  relationship: "supports" | "qualifies" | "contradicts" | "contextualises";
  line: number;
}

export interface KnowledgeMaterialClaim {
  text: string;
  sectionKey: string;
  relationship: KnowledgeClaimRelationship;
  startLine: number;
  endLine: number;
  locator: string;
}

export interface ParsedKnowledgeMarkdown {
  frontmatter: KnowledgeMarkdownFrontmatter;
  body: string;
  sections: KnowledgeMarkdownSection[];
  evidenceUrls: KnowledgeMarkdownEvidenceUrl[];
  materialClaims: KnowledgeMaterialClaim[];
}

const MATERIAL_SECTION_RELATIONSHIPS: Record<string, KnowledgeClaimRelationship> = {
  direct_answer: "answers",
  detailed_explanation: "supports",
  important_limitations: "qualifies",
  what_remains_uncertain: "qualifies",
  related_trace_knowledge: "contextualises",
};

/** Parse frontmatter, sections, material claims, and evidence URLs. */
export function parseKnowledgeMarkdown(raw: string): ParsedKnowledgeMarkdown | { error: string } {
  const frontmatterResult = parseFrontmatter(raw);
  if ("error" in frontmatterResult) return frontmatterResult;

  const { frontmatter, body } = frontmatterResult;
  const sections = parseSections(body);
  return {
    frontmatter,
    body,
    sections,
    evidenceUrls: extractEvidenceUrlsFromSections(sections),
    materialClaims: extractMaterialClaims(sections),
  };
}

/** Extract evidence URLs from a body when the frontmatter is not available. */
export function extractEvidenceUrlsFromMarkdown(body: string): KnowledgeMarkdownEvidenceUrl[] {
  return extractEvidenceUrlsFromSections(parseSections(body));
}

function parseFrontmatter(raw: string):
  | { frontmatter: KnowledgeMarkdownFrontmatter; body: string }
  | { error: string } {
  if (!raw.trimStart().startsWith("---")) {
    return { error: "Document must start with YAML frontmatter delimited by ---" };
  }

  const trimmed = raw.trimStart();
  const firstLineEnd = trimmed.indexOf("\n", 3);
  if (firstLineEnd === -1) return { error: "Missing closing --- for YAML frontmatter" };

  const rest = trimmed.slice(firstLineEnd + 1);
  const closingMatch = rest.match(/\r?\n---(?:\r?\n|$)/);
  if (!closingMatch || closingMatch.index === undefined) {
    return { error: "Missing closing --- for YAML frontmatter" };
  }

  const yamlBlock = rest.slice(0, closingMatch.index);
  const body = rest.slice(closingMatch.index + closingMatch[0].length).trim();
  const frontmatter: KnowledgeMarkdownFrontmatter = {};
  let currentListKey: string | null = null;

  for (const line of yamlBlock.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    if (trimmedLine.startsWith("- ") && currentListKey) {
      const value = unquote(trimmedLine.slice(2).trim());
      const existing = frontmatter[currentListKey];
      if (Array.isArray(existing)) existing.push(value);
      else frontmatter[currentListKey] = [value];
      continue;
    }

    const colonIndex = trimmedLine.indexOf(":");
    if (colonIndex === -1) continue;
    const key = trimmedLine.slice(0, colonIndex).trim();
    let value = unquote(trimmedLine.slice(colonIndex + 1).trim());
    if (!value || value === "..." || value === "YYYY-MM-DD") {
      if (["valid_from", "review_after", "hard_expiry", "source_set_hash"].includes(key)) value = "";
      else if (key !== "topics") continue;
    }

    if (key === "topics") {
      currentListKey = "topics";
      if (value && value !== "[]") frontmatter.topics = [value];
      continue;
    }

    currentListKey = null;
    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

function parseSections(body: string): KnowledgeMarkdownSection[] {
  const lines = body.split(/\r?\n/);
  const headings: Array<{ title: string; lineIndex: number }> = [];
  for (const [lineIndex, line] of lines.entries()) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) headings.push({ title: match[1].trim(), lineIndex });
  }

  return headings.map((heading, index) => {
    const endIndex = index + 1 < headings.length ? headings[index + 1].lineIndex : lines.length;
    const key = slugify(heading.title);
    return {
      key,
      title: heading.title,
      body: lines.slice(heading.lineIndex + 1, endIndex).join("\n").trim(),
      startLine: heading.lineIndex + 1,
      endLine: Math.max(heading.lineIndex + 1, endIndex),
    };
  });
}

function extractEvidenceUrlsFromSections(sections: KnowledgeMarkdownSection[]): KnowledgeMarkdownEvidenceUrl[] {
  const evidenceSections = sections.filter((section) =>
    /^(?:evidence|sources?|references?|supporting_evidence|contradictory_evidence)$/.test(section.key),
  );
  const sources: KnowledgeMarkdownEvidenceUrl[] = [];

  for (const section of evidenceSections) {
    const relationship = relationshipForEvidenceSection(section.key);
    const lines = section.body.split(/\r?\n/);
    for (const [offset, line] of lines.entries()) {
      const lineNumber = section.startLine + offset;
      const link = line.match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)(?:\s*(?:—|–|-)\s*(.*))?/);
      if (link) {
        addEvidenceSource(sources, {
          url: link[2].trim(),
          name: link[1].trim(),
          description: (link[3] ?? "").trim(),
          sectionKey: section.key,
          relationship,
          line: lineNumber,
        });
      }

      const bare = line.match(/(?:^|\s)(https?:\/\/[^\s<>]+)(?=$|\s)/);
      if (bare) {
        const url = bare[1].replace(/[.,;:)]+$/, "");
        addEvidenceSource(sources, {
          url,
          name: hostname(url),
          description: "",
          sectionKey: section.key,
          relationship,
          line: lineNumber,
        });
      }
    }
  }

  return sources;
}

function extractMaterialClaims(sections: KnowledgeMarkdownSection[]): KnowledgeMaterialClaim[] {
  const claims: KnowledgeMaterialClaim[] = [];
  const seen = new Set<string>();

  for (const section of sections) {
    const relationship = MATERIAL_SECTION_RELATIONSHIPS[section.key];
    if (!relationship) continue;

    const lines = section.body.split(/\r?\n/);
    let block: string[] = [];
    let blockStart = 0;
    let inFence = false;
    const flush = (endOffset: number) => {
      const text = cleanClaim(block.join(" "));
      block = [];
      if (text.length < 20 || /^https?:\/\//i.test(text)) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const startLine = section.startLine + blockStart;
      const endLine = section.startLine + Math.max(blockStart, endOffset);
      claims.push({
        text: text.slice(0, 2_000),
        sectionKey: section.key,
        relationship,
        startLine,
        endLine,
        locator: `markdown:${section.key}:${startLine}-${endLine}`,
      });
    };

    for (const [offset, line] of lines.entries()) {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const listItem = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
      if (!line.trim()) {
        if (block.length) flush(offset - 1);
        continue;
      }
      if (listItem) {
        if (block.length) flush(offset - 1);
        block = [listItem[1]];
        blockStart = offset;
        flush(offset);
        continue;
      }
      if (!block.length) blockStart = offset;
      block.push(line.trim());
    }
    if (block.length) flush(lines.length - 1);
  }

  return claims;
}

function addEvidenceSource(sources: KnowledgeMarkdownEvidenceUrl[], source: KnowledgeMarkdownEvidenceUrl): void {
  if (!sources.some((item) => item.url === source.url)) sources.push(source);
}

function relationshipForEvidenceSection(sectionKey: string): KnowledgeMarkdownEvidenceUrl["relationship"] {
  if (sectionKey === "contradictory_evidence") return "contradicts";
  if (sectionKey === "supporting_evidence") return "supports";
  if (sectionKey === "references" || sectionKey === "context") return "contextualises";
  return "supports";
}

function cleanClaim(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function unquote(value: string): string {
  return value.replace(/^(["'])(.*)\1$/, "$2");
}

function hostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}
