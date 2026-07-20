-- The Trace Manifest — Source Seed Data
-- Insert the 64-source launch registry into D1

-- Section A: Official Model Providers (Tier A)
INSERT OR IGNORE INTO sources (name, url, feed_url, section, tier, treatment, cadence_minutes, ingestion_type)
VALUES
  ('OpenAI News', 'https://openai.com/news/', 'https://openai.com/news/rss.xml', 'A', 'A', 'vendor-reported', 60, 'rss'),
  ('OpenAI API Changelog', 'https://platform.openai.com/docs/changelog', NULL, 'A', 'A', 'primary-technical', 360, 'manual'),
  ('OpenAI Model Documentation', 'https://platform.openai.com/docs/models', NULL, 'A', 'A', 'primary-technical', 1440, 'manual'),
  ('Anthropic Newsroom', 'https://www.anthropic.com/news', NULL, 'A', 'A', 'vendor-reported', 60, 'page_diff'),
  ('Anthropic Research', 'https://www.anthropic.com/research', NULL, 'A', 'A', 'primary-research', 360, 'page_diff'),
  ('Anthropic API Release Notes', 'https://docs.anthropic.com/en/release-notes', NULL, 'A', 'A', 'primary-technical', 360, 'manual'),
  ('Google DeepMind Blog', 'https://deepmind.google/discover/blog/', 'https://deepmind.google/blog/rss.xml', 'A', 'A', 'primary-vendor', 120, 'rss'),
  ('Google Research Blog', 'https://research.google/blog/', 'https://research.google/blog/rss/', 'A', 'A', 'primary-research', 360, 'rss'),
  ('Google Developers AI', 'https://developers.googleblog.com/en/search/label/ai/', 'https://developers.googleblog.com/feeds/posts/default/-/ai/', 'A', 'A', 'primary-technical', 180, 'rss'),
  ('Google Cloud AI Blog', 'https://cloud.google.com/blog/products/ai-machine-learning', 'https://cloud.google.com/blog/products/ai-machine-learning/rss', 'A', 'A', 'primary-vendor', 360, 'rss'),
  ('Meta AI Blog', 'https://ai.meta.com/blog/', NULL, 'A', 'A', 'vendor-reported', 360, 'manual'),
  ('Meta AI Research', 'https://ai.meta.com/research/', NULL, 'A', 'A', 'primary-research', 720, 'manual'),
  ('Microsoft AI Blog', 'https://news.microsoft.com/source/topics/ai/', 'https://news.microsoft.com/source/topics/ai/feed/', 'A', 'A', 'vendor-reported', 180, 'rss'),
  ('Mistral News', 'https://mistral.ai/news/', 'https://mistral.ai/news/rss/', 'A', 'A', 'vendor-reported', 90, 'rss'),
  ('Cohere Blog', 'https://cohere.com/blog', 'https://cohere.com/blog/feed/', 'A', 'A', 'vendor-reported', 180, 'rss'),
  ('NVIDIA Technical Blog — GenAI', 'https://developer.nvidia.com/blog/category/generative-ai/', 'https://developer.nvidia.com/blog/category/generative-ai/feed/', 'A', 'A', 'primary-vendor', 180, 'rss'),
  ('Hugging Face Blog', 'https://huggingface.co/blog', 'https://huggingface.co/blog/feed.xml', 'A', 'A', 'mixed-primary', 120, 'rss'),
  ('AWS Machine Learning Blog', 'https://aws.amazon.com/blogs/machine-learning/', 'https://aws.amazon.com/blogs/machine-learning/feed/', 'A', 'A', 'primary-vendor', 180, 'rss'),
  ('Stability AI News', 'https://stability.ai/news', NULL, 'A', 'A', 'vendor-reported', 360, 'manual'),
  ('Apple ML Research', 'https://machinelearning.apple.com/', 'https://machinelearning.apple.com/rss.xml', 'A', 'A', 'primary-research', 720, 'rss'),
  ('IBM Research AI', 'https://research.ibm.com/artificial-intelligence', NULL, 'A', 'A', 'primary-research', 1440, 'manual'),
  ('Databricks Release Notes', 'https://docs.databricks.com/aws/en/release-notes', 'https://docs.databricks.com/aws/en/feed.xml', 'A', 'A', 'primary-technical', 360, 'rss');

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

-- ============================================================
-- Phase 2 batch 2: Remaining 25 sources to reach ~64 total
-- ============================================================

-- Section A additions: Tier A — missing vendor/technical sources
INSERT OR IGNORE INTO sources (name, url, feed_url, section, tier, treatment, cadence_minutes, ingestion_type)
VALUES
  ('Gemini API Release Notes', 'https://ai.google.dev/gemini-api/docs/changelog', NULL, 'A', 'A', 'primary-technical', 180, 'manual'),
  ('Azure Blog', 'https://azure.microsoft.com/en-us/blog/', 'https://azure.microsoft.com/en-us/blog/feed/', 'A', 'A', 'primary-technical', 180, 'rss'),
  ('GitHub Blog — AI & Copilot', 'https://github.blog/category/ai/', 'https://github.blog/ai-and-ml/feed/', 'A', 'A', 'primary-vendor', 180, 'rss'),
  ('NVIDIA Deep Learning Blog', 'https://blogs.nvidia.com/blog/category/enterprise/deep-learning/', 'https://blogs.nvidia.com/blog/category/deep-learning/feed/', 'A', 'A', 'vendor-reported', 180, 'rss'),
  ('AWS AI/ML What''s New', 'https://aws.amazon.com/new/?whats-new-content-all.sort-by=item.additionalFields.postDateTime&whats-new-content-all.sort-order=desc&awsf.whats-new-ml=*all', NULL, 'A', 'A', 'primary-technical', 180, 'manual'),
  ('Hugging Face Trending Models', 'https://huggingface.co/models?sort=trending', NULL, 'A', 'A', 'discovery', 120, 'manual'),
  ('xAI Blog', 'https://x.ai/blog', NULL, 'A', 'A', 'vendor-reported', 360, 'manual'),
  ('Together AI Blog', 'https://www.together.ai/blog', 'https://www.together.ai/blog/rss.xml', 'A', 'A', 'vendor-reported', 180, 'rss'),
  ('Groq Blog', 'https://groq.com/blog/', NULL, 'A', 'A', 'vendor-reported', 360, 'manual');

-- Section B: Chinese and open-weight ecosystems (Tier A/B)
INSERT OR IGNORE INTO sources (name, url, section, tier, treatment, cadence_minutes, ingestion_type)
VALUES
  ('GitHub — DeepSeek V3', 'https://github.com/deepseek-ai/DeepSeek-V3', 'B', 'A', 'primary-technical', 180, 'github_api'),
  ('GitHub — Qwen Code', 'https://github.com/QwenLM/qwen-code', 'B', 'A', 'primary-technical', 180, 'github_api'),
  ('AI21 Labs Blog', 'https://www.ai21.com/blog', NULL, 'B', 'B', 'vendor-reported', 720, 'manual');

-- Section C additions: Research and benchmark sources (Tier B)
INSERT OR IGNORE INTO sources (name, url, section, tier, treatment, cadence_minutes, ingestion_type)
VALUES
  ('MLCommons', 'https://mlcommons.org/', 'C', 'B', 'primary-research', 1440, 'manual'),
  ('Epoch AI', 'https://epochai.org/', 'C', 'B', 'primary-research', 1440, 'manual'),
  ('LMSYS Chatbot Arena', 'https://chat.lmsys.org/', 'C', 'B', 'primary-research', 1440, 'manual'),
  ('Stanford HELM', 'https://crfm.stanford.edu/helm/', 'C', 'B', 'primary-research', 1440, 'manual'),
  ('SWE-bench', 'https://www.swebench.com/', 'C', 'B', 'primary-research', 1440, 'manual'),
  ('LiveBench', 'https://livebench.ai/', 'C', 'B', 'primary-research', 1440, 'manual'),
  ('Artificial Analysis', 'https://artificialanalysis.ai/', 'C', 'B', 'primary-research', 1440, 'manual');

-- Section D additions: More GitHub repositories (Tier A)
INSERT OR IGNORE INTO sources (name, url, section, tier, treatment, cadence_minutes, ingestion_type)
VALUES
  ('GitHub — Transformers (HF)', 'https://github.com/huggingface/transformers', 'D', 'A', 'primary-technical', 360, 'github_api'),
  ('GitHub — PyTorch', 'https://github.com/pytorch/pytorch', 'D', 'A', 'primary-technical', 360, 'github_api'),
  ('GitHub — Cline', 'https://github.com/cline/cline', 'D', 'A', 'primary-technical', 180, 'github_api'),
  ('GitHub — Aider', 'https://github.com/Aider-AI/aider', 'D', 'A', 'primary-technical', 180, 'github_api');

-- Section F additions: Community signals (Tier C — discovery only)
INSERT OR IGNORE INTO sources (name, url, section, tier, treatment, cadence_minutes, ingestion_type)
VALUES
  ('Reddit — r/LocalLLaMA', 'https://www.reddit.com/r/LocalLLaMA/', 'F', 'C', 'discovery', 360, 'manual'),
  ('Reddit — r/MachineLearning', 'https://www.reddit.com/r/MachineLearning/', 'F', 'C', 'discovery', 360, 'manual');
