import { execFileSync } from "node:child_process";

function git(args) {
  execFileSync("git", args, { stdio: "inherit" });
}

// Always inspect local unstaged/staged edits. CI also inspects the complete event range.
git(["diff", "--check"]);
git(["diff", "--cached", "--check"]);

const base = process.env.TRACE_DIFF_BASE ?? "";
if (/^[0-9a-f]{40}$/i.test(base) && !/^0{40}$/.test(base)) {
  git(["diff", "--check", base, "HEAD"]);
}

console.log("Git whitespace checks passed.");
