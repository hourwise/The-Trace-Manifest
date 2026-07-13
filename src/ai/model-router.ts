// The Trace Manifest — AI Model Router
// Phase 5: Routes tasks to the correct model + mode.
// Enforces model allowlists and per-task restrictions.
// Per ADR-0008: no automatic model substitution.

import type { TraceTaskType, TraceModelId, TraceAIConfig } from "./provider";

// ============================================================
// Model routing rules
// ============================================================

export interface RouteResult {
  model: TraceModelId;
  reason: string;
}

/**
 * Determine which model to use for a given task.
 * Enforces: public tasks → flash model, editorial tasks → pro model.
 * Never silently substitutes models.
 */
export function routeModel(
  taskType: TraceTaskType,
  config: TraceAIConfig,
): RouteResult {
  switch (taskType) {
    case "ask_trace":
      return { model: config.publicModel, reason: "Public Ask TRACE → routine model" };

    case "editorial":
      return { model: config.editorialModel, reason: "Editorial workflow → reviewed model" };

    case "prediction":
      return { model: config.editorialModel, reason: "Prediction generation → reviewed model" };

    case "newsletter":
      return { model: config.editorialModel, reason: "Newsletter drafting → reviewed model" };

    case "internal":
      return { model: config.editorialModel, reason: "Internal research → reviewed model" };

    default:
      // Never silently route unknown tasks
      throw new Error(`No model route defined for task type: ${taskType}`);
  }
}

/**
 * Check if a model is on the allowlist for a given task.
 */
export function isModelAllowed(
  model: TraceModelId,
  taskType: TraceTaskType,
  config: TraceAIConfig,
): boolean {
  // Model must be in the global allowlist
  if (!config.modelAllowlist.includes(model)) {
    return false;
  }

  // Editorial model restricted to non-public tasks
  if (model === "deepseek-v4-pro" && taskType === "ask_trace" && config.publicModel !== "deepseek-v4-pro") {
    return false;
  }

  return true;
}

/**
 * Validate that a model assignment is safe.
 * Rejects deprecated aliases and unapproved substitutions.
 */
export function validateModelAssignment(
  model: TraceModelId,
  taskType: TraceTaskType,
  config: TraceAIConfig,
): { valid: boolean; reason?: string } {
  // Reject deprecated aliases (ADR-0008 section 2.1)
  const DEPRECATED_ALIASES = ["deepseek-chat", "deepseek-reasoner"];
  if (DEPRECATED_ALIASES.includes(model)) {
    return { valid: false, reason: `Model '${model}' is a deprecated alias and must not be used.` };
  }

  // Check allowlist
  if (config.modelAllowlist.length > 0 && !config.modelAllowlist.includes(model)) {
    return { valid: false, reason: `Model '${model}' is not on the configured allowlist.` };
  }

  // Check task-appropriate model
  const expectedRoute = routeModel(taskType, config);
  if (model !== expectedRoute.model && taskType === "ask_trace") {
    // Public tasks must use the configured public model — no silent substitution
    return { valid: false, reason: `Public task requires model '${expectedRoute.model}' but '${model}' was requested.` };
  }

  return { valid: true };
}
