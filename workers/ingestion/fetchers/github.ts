// GitHub Releases API fetcher
import type { Source, GitHubRelease } from "../types";

export async function fetchGitHubReleases(source: Source): Promise<Array<{
  external_id: string | null;
  url: string;
  title: string;
  summary: string | null;
  content_excerpt: string | null;
  author: string | null;
  published_at: string | null;
  raw_metadata: Record<string, unknown>;
}>> {
  // source.url should be like "https://github.com/ollama/ollama"
  const repoPath = extractRepoPath(source.url);

  if (!repoPath) {
    throw new Error(`Invalid GitHub URL: ${source.url}`);
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repoPath}/releases?per_page=10`,
      {
        headers: {
          "User-Agent": "TheTraceManifest/0.1",
          "Accept": "application/vnd.github+json",
          // Use GITHUB_TOKEN from env if available
          ...(typeof GITHUB_TOKEN !== "undefined" ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
        },
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API ${response.status}: ${response.statusText}`);
    }

    const releases = await response.json() as GitHubRelease[];

    return releases.map((release) => ({
      external_id: release.tag_name,
      url: release.html_url,
      title: `${repoPath} ${release.name || release.tag_name}`,
      summary: release.body ? release.body.substring(0, 500) : null,
      content_excerpt: release.body ? release.body.substring(0, 300) : null,
      author: release.author?.login || null,
      published_at: release.published_at,
      raw_metadata: {
        feed_type: "github_release",
        repo: repoPath,
        tag_name: release.tag_name,
      },
    }));
  } catch (error: any) {
    console.error(`GitHub fetch failed for ${source.name}: ${error.message}`);
    throw error;
  }
}

// Also check for security advisories
export async function fetchGitHubAdvisories(source: Source): Promise<Array<{
  external_id: string | null;
  url: string;
  title: string;
  summary: string | null;
  content_excerpt: string | null;
  author: string | null;
  published_at: string | null;
  raw_metadata: Record<string, unknown>;
}>> {
  const repoPath = extractRepoPath(source.url);
  if (!repoPath) return [];

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repoPath}/security-advisories?per_page=5`,
      {
        headers: {
          "User-Agent": "TheTraceManifest/0.1",
          "Accept": "application/vnd.github+json",
          ...(typeof GITHUB_TOKEN !== "undefined" ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
        },
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!response.ok) return []; // Repos without advisories return 404

    const advisories = await response.json() as any[];

    return advisories.map((a) => ({
      external_id: a.ghsa_id,
      url: a.html_url,
      title: `[Security] ${repoPath}: ${a.summary}`,
      summary: a.description?.substring(0, 500) || null,
      content_excerpt: a.description?.substring(0, 300) || null,
      author: null,
      published_at: a.published_at,
      raw_metadata: {
        feed_type: "github_security_advisory",
        repo: repoPath,
        severity: a.severity,
        cve_id: a.cve_id,
      },
    }));
  } catch {
    return [];
  }
}

function extractRepoPath(url: string): string | null {
  const match = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git|\/|$)/);
  return match ? match[1] : null;
}
