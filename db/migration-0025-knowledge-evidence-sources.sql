-- Add high-value knowledge evidence sources to the registry.
-- These were quarantined during knowledge doc source linking because
-- their domains weren't in the sources table yet.
-- Apply after migration-0024-guides-lab.sql.

INSERT OR IGNORE INTO sources (name, url, section, tier, treatment, cadence_minutes, ingestion_type, active, health_status, requires_review)
VALUES
  ('NIST CSRC Glossary', 'https://csrc.nist.gov/glossary', 'security', 'A', 'primary-technical', 1440, 'manual', 1, 'healthy', 1),
  ('Microsoft Azure AI Docs', 'https://learn.microsoft.com/en-us/azure/developer/ai/', 'ai-agents', 'B', 'vendor-reported', 1440, 'manual', 1, 'healthy', 0),
  ('Model Context Protocol Docs', 'https://modelcontextprotocol.io/docs', 'mcp-and-agents', 'B', 'primary-technical', 1440, 'manual', 1, 'healthy', 0),
  ('OpenAI Agents SDK Docs', 'https://openai.github.io/openai-agents-python/', 'ai-agents', 'B', 'vendor-reported', 1440, 'manual', 1, 'healthy', 0),
  ('NIST NCCoE AI', 'https://www.nccoe.nist.gov/projects/software-and-ai-agent-identity-and-authorization', 'security', 'A', 'primary-technical', 1440, 'manual', 1, 'healthy', 1),
  ('Z.AI Blog (GLM)', 'https://z.ai/blog', 'ai-agents', 'C', 'vendor-reported', 360, 'manual', 1, 'healthy', 0);
