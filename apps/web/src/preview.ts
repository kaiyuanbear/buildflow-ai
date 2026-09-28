export type PreviewFile = { path: string; language: string; contents: string };
export type PreviewManifest = { styles: string[]; scripts: string[] };

function escapeForInlineScript(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function findOrderedFiles(files: PreviewFile[], paths: string[], language: "css" | "js") {
  return paths.map((path) => files.find((file) => file.path === path && file.language === language)).filter((file): file is PreviewFile => Boolean(file));
}

function previewAssets(files: PreviewFile[], manifest?: PreviewManifest) {
  if (manifest) return { styles: findOrderedFiles(files, manifest.styles, "css"), scripts: findOrderedFiles(files, manifest.scripts, "js") };
  return { styles: files.filter((file) => file.path === "styles.css" && file.language === "css"), scripts: files.filter((file) => file.path === "app.js" && file.language === "js") };
}

function sanitizeEntryHtml(entry: string) {
  return entry.replace(/<script\b[^>]*\bsrc\s*=\s*[^>]*>[\s\S]*?<\/script\s*>/gi, "").replace(/<link\b[^>]*\bhref\s*=\s*[^>]*>/gi, "");
}

export function buildPreviewDocument(files: PreviewFile[], previewState: Record<string, unknown>, manifest?: PreviewManifest) {
  const entry = sanitizeEntryHtml(files.find((file) => file.path === "index.html")?.contents ?? "<main><h1>预览不可用</h1><p>未生成 index.html。</p></main>");
  const assets = previewAssets(files, manifest);
  const styles = assets.styles.map((file) => file.contents.replace(/<\/style/gi, "<\\/style")).join("\n");
  const scripts = assets.scripts.map((file) => file.contents.replace(/<\/script/gi, "<\\/script")).join("\n");
  const bridge = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">
<style>${styles}</style><script>window.__BUILDFLOW_INITIAL_STATE__=${escapeForInlineScript(previewState)};window.__BUILDFLOW_SAVE_STATE__=function(state){window.parent.postMessage({source:'buildflow-preview',type:'save-state',state:state},'*')};</script>`;
  const appScript = `<script>${scripts}</script>`;
  if (/<\/head>/i.test(entry)) return entry.replace(/<\/head>/i, `${bridge}</head>`).replace(/<\/body>/i, `${appScript}</body>`);
  return `<!doctype html><html><head><meta charset="utf-8">${bridge}</head><body>${entry}${appScript}</body></html>`;
}
