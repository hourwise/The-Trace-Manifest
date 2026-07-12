/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_INGESTION_API_URL: string;
  readonly ADMIN_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
