/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Address of the backend API, e.g. https://vms-demo-api.onrender.com (default: this computer)
  readonly VITE_API_URL?: string
  // "true" shows the DEMO banner on every page
  readonly VITE_DEMO_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
