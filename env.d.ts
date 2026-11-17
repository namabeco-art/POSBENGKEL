/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENROUTER_API_KEY?: string;
  readonly VITE_OPENROUTER_MODEL?: string;
  /** Model vision untuk OCR price list (opsional). */
  readonly VITE_OPENROUTER_VISION_MODEL?: string;
  /** Store ID bawaan (opsional). */
  readonly VITE_STORE_ID?: string;
  readonly VITE_STORE_NAME?: string;
  readonly VITE_CLOUD_ENABLED?: string;
  /** Kosongkan bila API Cloudflare di domain yang sama dengan aplikasi. */
  readonly VITE_CLOUD_API_URL?: string;
  readonly VITE_ALLOW_RUNTIME_SETTINGS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
