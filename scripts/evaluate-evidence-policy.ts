import { evaluateEvidencePolicy } from "../src/lib/server/evidence-evaluation";
import { evidencePolicyEvaluationFixtures } from "../src/lib/server/evidence-evaluation-fixtures";

const result = evaluateEvidencePolicy(evidencePolicyEvaluationFixtures());
console.log(JSON.stringify(result, null, 2));
if (!result.pass) {
  console.error(`Evidence policy evaluation failed: ${result.failures.join("; ")}`);
  process.exitCode = 1;
} else {
  console.log("Evidence policy evaluation passed; public numeric evidence scores remain disabled.");
}
