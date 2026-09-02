/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Game server address, for deployments where the client and the server are
   * served from different hosts. Unset means "same origin as this page".
   */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
