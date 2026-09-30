export type PreviewFile = { path: string; language: string; contents: string };
export type PreviewManifest = { styles: string[]; scripts: string[] };

export type PreviewBridgeMessage = {
  source: "buildflow-preview";
  type: "save-state" | "preview-ready" | "runtime-error";
  state?: Record<string, unknown>;
  message?: string;
  filename?: string;
  line?: number;
  column?: number;
};

function escapeForInlineScript(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function previewStateLiteral(previewState: Record<string, unknown>) {
  // A newly created version persists `{}` before its generated application has
  // saved anything. Treat that as "no saved state", not as an initialized but
  // incomplete state object. This keeps the standard `saved || defaults`
  // initialization pattern safe on the first preview while non-empty states
  // continue to round-trip unchanged.
  return Object.keys(previewState).length === 0 ? "undefined" : escapeForInlineScript(previewState);
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
<style>${styles}</style><style id="buildflow-hidden-state">html body [hidden]{display:none !important}</style><script>(function(){var source='buildflow-preview';var limit=function(value,max){return String(value||'未知错误').slice(0,max)};var report=function(type,payload){window.parent.postMessage(Object.assign({source:source,type:type},payload||{}),'*')};var scrollToInternalTarget=function(event){if(event.defaultPrevented||event.button&&event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;var anchor=event.target&&event.target.closest?event.target.closest('a[href^="#"]'):null;if(!anchor)return;var fragment=anchor.getAttribute('href');if(!fragment||fragment==='#')return;var id;try{id=decodeURIComponent(fragment.slice(1))}catch(_){return}var target=document.getElementById(id);if(!target)return;event.preventDefault();target.scrollIntoView({behavior:'smooth',block:'start'});target.setAttribute('tabindex','-1');target.focus({preventScroll:true})};window.__BUILDFLOW_INITIAL_STATE__=${previewStateLiteral(previewState)};window.__BUILDFLOW_SAVE_STATE__=function(state){report('save-state',{state:state})};window.addEventListener('error',function(event){report('runtime-error',{message:limit(event.message,320),filename:limit(event.filename,180),line:Number(event.lineno)||undefined,column:Number(event.colno)||undefined})});window.addEventListener('unhandledrejection',function(event){var reason=event.reason;report('runtime-error',{message:limit(reason&&reason.message?reason.message:reason,320)})});document.addEventListener('click',scrollToInternalTarget);window.addEventListener('load',function(){report('preview-ready')},{once:true})})()</script>`;
  const appScript = `<script>${scripts}</script>`;
  if (/<\/head>/i.test(entry)) return entry.replace(/<\/head>/i, `${bridge}</head>`).replace(/<\/body>/i, `${appScript}</body>`);
  return `<!doctype html><html><head><meta charset="utf-8">${bridge}</head><body>${entry}${appScript}</body></html>`;
}
