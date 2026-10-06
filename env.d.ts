/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_OPENROUTER_API_KEY?: string;
  readonly VITE_OPENROUTER_MODEL?: string;
  /** Model vision untuk OCR price list (opsional). */
  readonly VITE_OPENROUTER_VISION_MODEL?: string;
  readonly VITE_STORE_ID?: string;
  readonly VITE_CLOUD_ENABLED?: string;
  readonly VITE_ALLOW_RUNTIME_SETTINGS?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_BUCKET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
