-- The Trace Manifest — Source Seed Data
-- Insert the 65-source launch registry into D1

-- Section A: Official Model Providers (Tier A)
INSERT OR IGNORE INTO sources (name, url, feed_url, section, tier, treatment, cadence_minutes, ingestion_type)
VALUES
  ('OpenAI News', 'https://openai.com/news/', NULL, 'A', 'A', 'vendor-reported', 60, 'rss'),
  ('OpenAI API Changelog', 'https://platform.openai.com/docs/changelog', NULL, 'A', 'A', 'primary-technical', 180, 'page_diff'),
  ('OpenAI Model Documentation', 'https://platform.openai.com/docs/models', NULL, 'A', 'A', 'primary-technical', 1440, 'page_diff'),
  ('Anthropic Newsroom', 'https://www.anthropic.com/news', NULL, 'A', 'A', 'vendor-reported', 60, 'rss'),
  ('Anthropic Research', 'https://www.anthropic.com/research', NULL, 'A', 'A', 'primary-research', 360, 'rss'),
  ('Anthropic API Release Notes', 'https://docs.anthropic.com/en/release-notes', NULL, 'A', 'A', 'primary-technical', 180, 'page_diff'),
  ('Google DeepMind Blog', 'https://deepmind.google/discover/blog/', NULL, 'A', 'A', 'primary-vendor', 120, 'rss'),
  ('Google Research Blog', 'https://research.google/blog/', NULL, 'A', 'A', 'primary-research', 360, 'rss'),
  ('Google Developers AI', 'https://developers.googleblog.com/en/search/label/ai/', NULL, 'A', 'A', 'primary-technical', 120, 'rss'),
  ('Google Cloud AI Blog', 'https://cloud.google.com/blog/products/ai-machine-learning', NULL, 'A', 'A', 'primary-vendor', 180, 'rss'),
  ('Meta AI Blog', 'https://ai.meta.com/blog/', NULL, 'A', 'A', 'vendor-reported', 120, 'rss'),
  ('Meta AI Research', 'https://ai.meta.com/research/', NULL, 'A', 'A', 'primary-research', 360, 'rss'),
  ('Microsoft AI Blog', 'https://news.microsoft.com/source/topics/ai/', NULL, 'A', 'A', 'vendor-reported', 180, 'rss'),
  ('Mistral News', 'https://mistral.ai/news/', NULL, 'A', 'A', 'vendor-reported', 90, 'rss'),
  ('Cohere Blog', 'https://cohere.com/blog', NULL, 'A', 'A', 'vendor-reported', 180, 'rss'),
  ('NVIDIA Technical Blog — GenAI', 'https://developer.nvidia.com/blog/category/generative-ai/', NULL, 'A', 'A', 'primary-vendor', 180, 'rss'),
  ('Hugging Face Blog', 'https://huggingface.co/blog', NULL, 'A', 'A', 'mixed-primary', 120, 'rss'),
  ('AWS Machine Learning Blog', 'https://aws.amazon.com/blogs/machine-learning/', NULL, 'A', 'A', 'primary-vendor', 180, 'rss'),
  ('Stability AI News', 'https://stability.ai/news', NULL, 'A', 'A', 'vendor-reported', 180, 'rss'),
  ('Apple ML Research', 'https://machinelearning.apple.com/', NULL, 'A', 'A', 'primary-research', 720, 'rss'),
  ('IBM Research AI', 'https://research.ibm.com/artificial-intelligence', NULL, 'A', 'A', 'primary-research', 720, 'rss'),
  ('Databricks AI Blog', 'https://www.databricks.com/blog/category/engineering/data-science-ai', NULL, 'A', 'A', 'primary-vendor', 360, 'rss');

-- Section C: Research (Tier B)
INSERT OR IGNORE INTO sources (name, url, section, tier, treatment, cadence_minutes, ingestion_type)
VALUES
  ('arXiv cs.AI', 'https://arxiv.org/list/cs.AI/recent', 'C', 'B', 'primary-research', 360, 'arxiv_api'),
  ('arXiv cs.CL', 'https://arxiv.org/list/cs.CL/recent', 'C', 'B', 'primary-research', 360, 'arxiv_api'),
  ('arXiv cs.LG', 'https://arxiv.org/list/cs.LG/recent', 'C', 'B', 'primary-research', 360, 'arxiv_api'),
  ('arXiv cs.CV', 'https://arxiv.org/list/cs.CV/recent', 'C', 'B', 'primary-research', 720, 'arxiv_api'),
  ('arXiv cs.SE', 'https://arxiv.org/list/cs.SE/recent', 'C', 'B', 'primary-research', 720, 'arxiv_api'),
  ('arXiv stat.ML', 'https://arxiv.org/list/stat.ML/recent', 'C', 'B', 'primary-research', 720, 'arxiv_api');

-- Section D: GitHub Repositories (Tier A — single connector)
INSERT OR IGNORE INTO sources (name, url, section, tier, treatment, cadence_minutes, ingestion_type)
VALUES
  ('GitHub — llama.cpp', 'https://github.com/ggml-org/llama.cpp', 'D', 'A', 'primary-technical', 180, 'github_api'),
  ('GitHub — Ollama', 'https://github.com/ollama/ollama', 'D', 'A', 'primary-technical', 180, 'github_api'),
  ('GitHub — vLLM', 'https://github.com/vllm-project/vllm', 'D', 'A', 'primary-technical', 180, 'github_api'),
  ('GitHub — LangChain', 'https://github.com/langchain-ai/langchain', 'D', 'A', 'primary-technical', 360, 'github_api'),
  ('GitHub — LlamaIndex', 'https://github.com/run-llama/llama_index', 'D', 'A', 'primary-technical', 360, 'github_api'),
  ('GitHub — AutoGen', 'https://github.com/microsoft/autogen', 'D', 'A', 'primary-technical', 360, 'github_api'),
  ('GitHub — MCP Spec', 'https://github.com/modelcontextprotocol/specification', 'D', 'A', 'primary-technical', 180, 'github_api'),
  ('GitHub — MCP Servers', 'https://github.com/modelcontextprotocol/servers', 'D', 'A', 'primary-technical', 360, 'github_api'),
  ('GitHub — LM Eval Harness', 'https://github.com/EleutherAI/lm-evaluation-harness', 'D', 'A', 'primary-technical', 360, 'github_api'),
  ('GitHub — LiteLLM', 'https://github.com/BerriAI/litellm', 'D', 'A', 'primary-technical', 360, 'github_api');

-- Section F: Community (Tier C — discovery only)
INSERT OR IGNORE INTO sources (name, url, section, tier, treatment, cadence_minutes, ingestion_type)
VALUES
  ('Hacker News', 'https://news.ycombinator.com/', 'F', 'C', 'discovery', 120, 'hackernews_api');
