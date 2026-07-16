// TRACE Guide contract — ADR 0013.
// This is metadata and validation only. It deliberately has no persistence or
// publication function: model output and browser input cannot auto-publish a guide.

export const GUIDE_CONTRACT_VERSION = "adr-0013-2026-07-16.1";

export const GUIDE_CATEGORIES = [
  "local-ai", "mcp-agents", "git-github", "servers-self-hosting", "cloud-deployment",
  "security", "development-tools", "troubleshooting", "mobile-development", "databases", "automation",
] as const;
export type GuideCategory = typeof GUIDE_CATEGORIES[number];

export const GUIDE_VERIFICATION_STATUSES = [
  "documentation-reviewed", "partially-tested", "fully-tested", "long-term-tested",
  "needs-review", "outdated", "withdrawn",
] as const;
export type GuideVerificationStatus = typeof GUIDE_VERIFICATION_STATUSES[number];

export interface GuideSourceRelationship {
  sourceReference: string;
  sourceKind: "external_primary" | "external_independent" | "external_vendor" | "trace_lab_result";
  relationship: "instruction-source" | "security-source" | "compatibility-source" | "pricing-source" | "background" | "contradicting-source";
  supportsSections: string[];
  lastCheckedAt: string;
}

/**
 * Review record for a command that a reader is invited to run.  A command is
 * deliberately described, rather than merely copied into guide prose, so its
 * operational impact can be checked independently.
 */
export interface GuideCommand {
  command: string;
  operatingSystem: string;
  shell: string;
  workingDirectory: string;
  requiresAdministrator: boolean;
  writesOrDeletes: boolean;
  opensNetworkPort: boolean;
  downloadsExecutableCode: boolean;
  variablesToReplace: string[];
  expectedOutput: string;
  rollback: string;
}

export interface TraceGuideMetadata {
  id: string;
  slug: string;
  title: string;
  category: GuideCategory;
  difficulty: "beginner" | "intermediate" | "advanced";
  verificationStatus: GuideVerificationStatus;
  version: number;
  testedOperatingSystems: string[];
  testedVersions: Record<string, string>;
  authorUserId: string;
  reviewedByUserId: string;
  reviewedAt: string;
  estimatedCost?: string;
  destructiveStepsPresent: boolean;
  networkExposurePresent: boolean;
  credentialsRequired: boolean;
  rootOrAdministratorAccessRequired: boolean;
  downloadsExecutableCode: boolean;
  commands: GuideCommand[];
  sourceRelationships: GuideSourceRelationship[];
  publicationStatus: "draft" | "review" | "published" | "withdrawn";
  publicationMode: "manual_only";
  publicationApprovedByUserId?: string;
  publicationApprovedAt?: string;
  publishedAt?: string;
  lastVerifiedAt: string;
  reviewDueAt: string;
}

export interface GuideValidationResult {
  valid: boolean;
  errors: string[];
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function nonEmptyString(value: unknown, maximum = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

export function validateGuideCommand(input: unknown): GuideValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["Guide command must be an object."] };
  }
  const command = input as Record<string, unknown>;
  const allowedKeys = new Set([
    "command", "operatingSystem", "shell", "workingDirectory", "requiresAdministrator",
    "writesOrDeletes", "opensNetworkPort", "downloadsExecutableCode", "variablesToReplace",
    "expectedOutput", "rollback",
  ]);
  const errors: string[] = [];
  if (Object.keys(command).some((key) => !allowedKeys.has(key))) errors.push("Guide command contains unknown fields.");
  for (const field of ["command", "operatingSystem", "shell", "workingDirectory", "expectedOutput", "rollback"] as const) {
    if (!nonEmptyString(command[field])) errors.push(`${field} is required.`);
  }
  for (const field of ["requiresAdministrator", "writesOrDeletes", "opensNetworkPort", "downloadsExecutableCode"] as const) {
    if (typeof command[field] !== "boolean") errors.push(`${field} must be explicit.`);
  }
  if (!Array.isArray(command.variablesToReplace) || !command.variablesToReplace.every((value) => nonEmptyString(value, 100))) {
    errors.push("variablesToReplace must be an array of named placeholders.");
  }
  return { valid: errors.length === 0, errors };
}

export function guideFreshness(metadata: Pick<TraceGuideMetadata, "verificationStatus" | "lastVerifiedAt" | "reviewDueAt">, now = Date.now()):
  "current" | "review_due" | "outdated" | "withdrawn" | "invalid" {
  if (!validDate(metadata.lastVerifiedAt) || !validDate(metadata.reviewDueAt)) return "invalid";
  if (metadata.verificationStatus === "withdrawn") return "withdrawn";
  if (metadata.verificationStatus === "outdated") return "outdated";
  return new Date(metadata.reviewDueAt).getTime() < now || metadata.verificationStatus === "needs-review"
    ? "review_due"
    : "current";
}

export function isGuideEligibleForProceduralRetrieval(metadata: TraceGuideMetadata, now = Date.now()): boolean {
  const freshness = guideFreshness(metadata, now);
  return metadata.publicationStatus === "published" && freshness !== "outdated" && freshness !== "withdrawn" && freshness !== "invalid";
}

export function validateGuideMetadata(input: unknown): GuideValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { valid: false, errors: ["Guide metadata must be an object."] };
  const guide = input as Record<string, unknown>;
  const errors: string[] = [];
  const allowedKeys = new Set([
    "id", "slug", "title", "category", "difficulty", "verificationStatus", "version", "testedOperatingSystems",
    "testedVersions", "authorUserId", "reviewedByUserId", "reviewedAt", "estimatedCost", "destructiveStepsPresent",
    "networkExposurePresent", "credentialsRequired", "rootOrAdministratorAccessRequired", "downloadsExecutableCode",
    "commands",
    "sourceRelationships", "publicationStatus", "publicationMode", "publicationApprovedByUserId", "publicationApprovedAt",
    "publishedAt", "lastVerifiedAt", "reviewDueAt",
  ]);
  if (Object.keys(guide).some((key) => !allowedKeys.has(key))) errors.push("Guide metadata contains unknown fields.");
  for (const field of ["id", "slug", "title", "authorUserId", "reviewedByUserId"] as const) {
    if (!nonEmptyString(guide[field])) errors.push(`${field} is required.`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(guide.slug ?? ""))) errors.push("slug must be lowercase kebab-case.");
  if (!GUIDE_CATEGORIES.includes(guide.category as GuideCategory)) errors.push("category is invalid.");
  if (!["beginner", "intermediate", "advanced"].includes(guide.difficulty as string)) errors.push("difficulty is invalid.");
  if (!GUIDE_VERIFICATION_STATUSES.includes(guide.verificationStatus as GuideVerificationStatus)) errors.push("verificationStatus is invalid.");
  if (!Number.isInteger(guide.version) || Number(guide.version) < 1) errors.push("version must be a positive integer.");
  if (!Array.isArray(guide.testedOperatingSystems) || guide.testedOperatingSystems.length === 0 || !guide.testedOperatingSystems.every((value) => nonEmptyString(value, 100))) {
    errors.push("testedOperatingSystems must contain at least one named operating system.");
  }
  if (!guide.testedVersions || typeof guide.testedVersions !== "object" || Array.isArray(guide.testedVersions)
    || Object.entries(guide.testedVersions).length === 0 || !Object.entries(guide.testedVersions).every(([key, value]) => nonEmptyString(key, 100) && nonEmptyString(value, 100))) {
    errors.push("testedVersions must contain named, non-empty version values.");
  }
  for (const field of ["destructiveStepsPresent", "networkExposurePresent", "credentialsRequired", "rootOrAdministratorAccessRequired", "downloadsExecutableCode"] as const) {
    if (typeof guide[field] !== "boolean") errors.push(`${field} must be explicit.`);
  }
  if (!Array.isArray(guide.commands) || guide.commands.length === 0) {
    errors.push("commands must contain at least one independently reviewed command.");
  } else if (guide.commands.some((command) => !validateGuideCommand(command).valid)) {
    errors.push("each command requires complete safety and rollback metadata.");
  }
  if (!Array.isArray(guide.sourceRelationships) || guide.sourceRelationships.length === 0) {
    errors.push("sourceRelationships must contain at least one external source.");
  } else {
    for (const source of guide.sourceRelationships) {
      if (!source || typeof source !== "object" || Array.isArray(source)) { errors.push("sourceRelationships contains an invalid source."); continue; }
      const value = source as Record<string, unknown>;
      const sourceKeys = new Set(["sourceReference", "sourceKind", "relationship", "supportsSections", "lastCheckedAt"]);
      if (Object.keys(value).some((key) => !sourceKeys.has(key)) || !nonEmptyString(value.sourceReference, 2_048)
        || !["external_primary", "external_independent", "external_vendor", "trace_lab_result"].includes(value.sourceKind as string)
        || !["instruction-source", "security-source", "compatibility-source", "pricing-source", "background", "contradicting-source"].includes(value.relationship as string)
        || !Array.isArray(value.supportsSections) || value.supportsSections.length === 0
        || !value.supportsSections.every((section) => nonEmptyString(section, 200)) || !validDate(value.lastCheckedAt)) {
        errors.push("each source relationship requires a source, relationship, supported section, and check date.");
      }
    }
  }
  for (const field of ["reviewedAt", "lastVerifiedAt", "reviewDueAt"] as const) if (!validDate(guide[field])) errors.push(`${field} must be a valid date.`);
  if (validDate(guide.lastVerifiedAt) && validDate(guide.reviewDueAt) && new Date(guide.reviewDueAt).getTime() < new Date(guide.lastVerifiedAt).getTime()) {
    errors.push("reviewDueAt must not precede lastVerifiedAt.");
  }
  if (guide.publicationMode !== "manual_only") errors.push("publicationMode must be manual_only.");
  if (!["draft", "review", "published", "withdrawn"].includes(guide.publicationStatus as string)) errors.push("publicationStatus is invalid.");
  if (guide.publicationStatus === "published") {
    if (!nonEmptyString(guide.publicationApprovedByUserId) || !validDate(guide.publicationApprovedAt) || !validDate(guide.publishedAt)) {
      errors.push("published guides require a named manual approval and publication time.");
    }
    if (["needs-review", "outdated", "withdrawn"].includes(guide.verificationStatus as string)) {
      errors.push("a needs-review, outdated, or withdrawn guide cannot be published.");
    }
  }
  return { valid: errors.length === 0, errors };
}
