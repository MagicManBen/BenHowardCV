document.addEventListener("DOMContentLoaded", () => {
  window.CVRuntime?.initFullPage();
  initEmbeddedFrameReporting();
});

function initEmbeddedFrameReporting() {
  if (window.parent === window) return;

  const postMetrics = () => {
    const doc = document.documentElement;
    const body = document.body;
    const height = Math.max(
      doc ? doc.scrollHeight : 0,
      body ? body.scrollHeight : 0,
      doc ? doc.offsetHeight : 0,
      body ? body.offsetHeight : 0
    );

    window.parent.postMessage({
      type: "cv-full-embed-metrics",
      height,
      title: document.title
    }, "*");
  };

  window.addEventListener("load", postMetrics);
  window.addEventListener("resize", postMetrics, { passive: true });

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(() => postMetrics());
    if (document.documentElement) observer.observe(document.documentElement);
    if (document.body) observer.observe(document.body);
  }

  window.setTimeout(postMetrics, 150);
  window.setTimeout(postMetrics, 600);
  window.setTimeout(postMetrics, 1400);
}
