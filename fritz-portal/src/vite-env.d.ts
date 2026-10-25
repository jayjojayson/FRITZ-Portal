/// <reference types="vite/client" />

// Wird von Vite beim Build aus package.json eingesetzt (vite.config.ts → define)
declare const __APP_VERSION__: string;
declare module '*.png' {
  const src: string;
  export default src;
}
