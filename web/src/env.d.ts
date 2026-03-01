/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_ANON_KEY: string;
  readonly GROQ_API_KEY: string;
  readonly HF_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
