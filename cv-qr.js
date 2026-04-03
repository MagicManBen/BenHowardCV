document.addEventListener("DOMContentLoaded", () => {
  initQrFullPageShell().catch((error) => {
    console.error(error);
    showError("Could not load the full tailored page.");
  });
});

async function initQrFullPageShell() {
  const frame = document.getElementById("qr-full-frame");
  if (!frame) throw new Error("QR full-page frame not found.");

  const targetUrl = buildFullPageUrl();
  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow) return;
    const payload = event.data;
    if (!payload || payload.type !== "cv-full-embed-metrics") return;
    if (payload.height) {
      frame.style.height = `${payload.height}px`;
    }
    if (payload.title) {
      document.title = payload.title;
    }
  });

  frame.addEventListener("load", () => {
    showFrame();
    try {
      wireFrameSizing(frame);
      syncTitleFromFrame(frame);
    } catch (error) {
      console.warn("QR frame advanced sizing unavailable, using iframe fallback.", error);
    }
  }, { once: true });

  frame.src = targetUrl.href;
}

function buildFullPageUrl() {
  const current = new URL(window.location.href);
  const target = new URL("cv.html", current.href);

  ["ref", "sc", "print"].forEach((key) => {
    const value = current.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  });

  if (current.hash) {
    target.hash = current.hash;
  }

  return target;
}

function wireFrameSizing(frame) {
  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument;
  if (!frameWindow || !frameDocument) {
    throw new Error("Unable to access the full-page document inside the QR frame.");
  }

  const resize = () => {
    const doc = frameDocument.documentElement;
    const body = frameDocument.body;
    const nextHeight = Math.max(
      doc ? doc.scrollHeight : 0,
      body ? body.scrollHeight : 0,
      doc ? doc.offsetHeight : 0,
      body ? body.offsetHeight : 0
    );
    if (nextHeight) {
      frame.style.height = `${nextHeight}px`;
    }
  };

  resize();
  frameWindow.addEventListener("resize", resize, { passive: true });
  window.addEventListener("resize", resize, { passive: true });

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(() => resize());
    if (frameDocument.documentElement) observer.observe(frameDocument.documentElement);
    if (frameDocument.body) observer.observe(frameDocument.body);
  } else {
    window.setTimeout(resize, 350);
    window.setTimeout(resize, 900);
  }
}

function syncTitleFromFrame(frame) {
  const frameDocument = frame.contentDocument;
  if (!frameDocument) return;
  if (frameDocument.title) {
    document.title = frameDocument.title;
  }
}

function showFrame() {
  document.getElementById("qr-loading")?.setAttribute("hidden", "");
  document.getElementById("qr-error")?.setAttribute("hidden", "");
  document.getElementById("qr-full-frame")?.removeAttribute("hidden");
}

function showError(message) {
  document.getElementById("qr-loading")?.setAttribute("hidden", "");
  document.getElementById("qr-full-frame")?.setAttribute("hidden", "");
  const error = document.getElementById("qr-error");
  if (!error) return;
  error.textContent = message;
  error.removeAttribute("hidden");
}
