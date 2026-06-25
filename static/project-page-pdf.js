import * as pdfjsLib from "./vendor/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.mjs", import.meta.url).toString();

const figures = Array.from(document.querySelectorAll(".js-pdf-figure"));

function makeRenderer(root) {
  const canvas = root.querySelector(".figure-pdf-canvas");
  const pdfSrc = root.dataset.pdfSrc;
  let pdfDocumentPromise = null;
  let lastWidth = 0;
  let rendering = false;
  let needsRender = false;
  let targetWidth = 0;

  async function loadPdf() {
    if (!pdfDocumentPromise) {
      pdfDocumentPromise = pdfjsLib.getDocument(pdfSrc).promise;
    }
    return pdfDocumentPromise;
  }

  async function render() {
    targetWidth = Math.round(root.getBoundingClientRect().width);
    if (!targetWidth) {
      return;
    }

    if (rendering) {
      needsRender = true;
      return;
    }

    rendering = true;

    try {
      do {
        needsRender = false;

        if (Math.abs(targetWidth - lastWidth) < 2 && root.classList.contains("is-rendered")) {
          continue;
        }

        const pdf = await loadPdf();
        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const context = canvas.getContext("2d", { alpha: false });

        canvas.width = Math.round(viewport.width * dpr);
        canvas.height = Math.round(viewport.height * dpr);
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, viewport.width, viewport.height);

        await page.render({
          canvasContext: context,
          viewport,
        }).promise;

        lastWidth = targetWidth;
        root.classList.add("is-rendered");
      } while (needsRender);
    } finally {
      rendering = false;
    }

  }

  return render;
}

const renderers = figures.map((root) => makeRenderer(root));

function requestAllRenders() {
  renderers.forEach((render) => {
    render().catch((error) => {
      console.error("Failed to render project PDF figure.", error);
    });
  });
}

if (figures.length) {
  requestAllRenders();

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(requestAllRenders);
    });
    figures.forEach((root) => observer.observe(root));
  } else {
    window.addEventListener("resize", () => {
      requestAnimationFrame(requestAllRenders);
    });
  }
}
