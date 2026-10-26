// Public presentation of a story that was published and later withdrawn or
// superseded. The page stays at its original URL for transparency, so the
// wording must make clear that the historical article, analysis, sources and
// evidence rating are not current TRACE reporting.
//
// TRACE stores no structured withdrawal reason: the withdraw route appends the
// operator's reason to editorial_analysis as prose, which the page already
// shows. This module never parses reasons out of prose.

export type RetiredStatus = "withdrawn" | "superseded";

export interface ReplacementStory {
  slug: string;
  headline: string;
}

export interface RetiredStoryNotice {
  status: RetiredStatus;
  title: string;
  paragraphs: string[];
  /** Only set when a reviewed `supersedes` relationship links a currently published story. */
  replacement: ReplacementStory | null;
  /** Shown beside the evidence badge so it is not read as a current verification decision. */
  evidenceLabel: string;
}

export function isRetiredStatus(status: string | null | undefined): status is RetiredStatus {
  return status === "withdrawn" || status === "superseded";
}

export function retiredStoryNotice(
  status: string | null | undefined,
  replacement: ReplacementStory | null = null,
): RetiredStoryNotice | null {
  if (!isRetiredStatus(status)) return null;
  const evidenceLabel = "Evidence rating at publication (historical, not a current assessment)";
  if (status === "withdrawn") {
    return {
      status,
      title: "This story has been withdrawn",
      paragraphs: [
        "TRACE withdrew this story after publication. Its original text, analysis, source links and evidence rating remain available for transparency and historical reference.",
        "They are not current TRACE reporting and should not be treated as verified information. Any published correction is listed below.",
      ],
      replacement: null,
      evidenceLabel,
    };
  }
  return {
    status,
    title: "This story has been superseded",
    paragraphs: [
      "Newer information has replaced this story. It is kept for reference and reflects what was known when it was published.",
      replacement
        ? "Read the current story for the latest reviewed information."
        : "Its original text, sources and evidence rating should not be treated as the current position.",
    ],
    replacement,
    evidenceLabel,
  };
}
