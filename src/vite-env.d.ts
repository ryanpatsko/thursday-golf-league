/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_AUTH_URL?: string
  readonly VITE_LEAGUE_DATA_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
