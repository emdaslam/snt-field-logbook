// Next.js supports `?url` import suffixes (asset URLs); declare them so
// TypeScript accepts e.g. `import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"`.
declare module "*?url" {
  const src: string;
  export default src;
}
