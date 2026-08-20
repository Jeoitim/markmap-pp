function stripScripts(source: string) {
  return source.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
}

export function createStaticPdfHtml(
  source: string,
  width: number,
  height: number,
  backgroundColor: string,
) {
  const safeWidth = Math.max(1, Math.ceil(width));
  const safeHeight = Math.max(1, Math.ceil(height));
  const safeSource = stripScripts(source);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob: http: https:; font-src data: https:;"><style>@page{size:${safeWidth}px ${safeHeight}px;margin:0}html,body{width:${safeWidth}px;height:${safeHeight}px;margin:0;padding:0;overflow:hidden}body{background:${backgroundColor};print-color-adjust:exact;-webkit-print-color-adjust:exact}svg.markmap{display:block;width:${safeWidth}px;height:${safeHeight}px;overflow:visible}</style></head><body>${safeSource}</body></html>`;
}

export function openPdfPrintWindow() {
  return window.open('', '_blank');
}

async function waitForPrintAssets(printWindow: Window) {
  const documentNode = printWindow.document;
  const fontsReady = documentNode.fonts?.ready || Promise.resolve();
  const imagesReady = Promise.all(
    Array.from(documentNode.images).map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    }),
  );
  await Promise.race([
    Promise.all([fontsReady, imagesReady]),
    new Promise<void>((resolve) => window.setTimeout(resolve, 3000)),
  ]);
}

export async function printStaticPdf(
  printWindow: Window | null,
  html: string,
  blockedMessage = '浏览器阻止了打印窗口，请允许弹出窗口后重试',
) {
  if (!printWindow || printWindow.closed) throw new Error(blockedMessage);
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  await waitForPrintAssets(printWindow);
  printWindow.addEventListener(
    'afterprint',
    () => {
      if (!printWindow.closed) printWindow.close();
    },
    { once: true },
  );
  printWindow.focus();
  printWindow.print();
}
