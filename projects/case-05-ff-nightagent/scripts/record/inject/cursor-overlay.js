/* 录制专用虚拟鼠标 + 字幕 runtime · 由 runner.mjs 注入 · 暴露 window.__rec API */
(() => {
  if (window.__rec) return; // idempotent · 路由切换会重复注入

  function injectStyle() {
    if (document.querySelector('style[data-rec-style]')) return;
    const css = window.__REC_CSS__;
    if (!css) return;
    const target = document.head || document.documentElement;
    if (!target) return;
    const style = document.createElement("style");
    style.setAttribute("data-rec-style", "1");
    style.textContent = css;
    target.appendChild(style);
  }

  function mount() {
    injectStyle();
    const cursor = document.createElement("div");
    cursor.className = "__rec-cursor";
    cursor.setAttribute("data-rec-overlay", "cursor");
    cursor.innerHTML =
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L5.5 3.21Z"/>' +
      "</svg>";

    const ripple = document.createElement("div");
    ripple.className = "__rec-ripple";
    ripple.setAttribute("data-rec-overlay", "ripple");

    const subtitle = document.createElement("div");
    subtitle.className = "__rec-subtitle";
    subtitle.setAttribute("data-rec-overlay", "subtitle");

    function ensureMounted() {
      injectStyle();
      const target = document.body || document.documentElement;
      if (!target) return;
      if (!cursor.isConnected) target.appendChild(cursor);
      if (!ripple.isConnected) target.appendChild(ripple);
      if (!subtitle.isConnected) target.appendChild(subtitle);
    }
    ensureMounted();

    // React Hydration / route change 可能把节点清掉 · MutationObserver 自愈
    new MutationObserver(ensureMounted).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    let lastX = window.innerWidth / 2;
    let lastY = window.innerHeight / 2;
    let subtitleTimer = null;

    function setPos(x, y, pressed) {
      lastX = x;
      lastY = y;
      cursor.style.left = x + "px";
      cursor.style.top = y + "px";
      cursor.classList.add("is-visible");
      cursor.classList.toggle("is-pressed", !!pressed);
    }

    function fireRipple(x, y) {
      ripple.style.left = x + "px";
      ripple.style.top = y + "px";
      ripple.classList.remove("is-firing");
      // force reflow to restart anim
      void ripple.offsetWidth;
      ripple.classList.add("is-firing");
    }

    function showSubtitle(text, holdMs) {
      if (subtitleTimer) {
        clearTimeout(subtitleTimer);
        subtitleTimer = null;
      }
      if (!text) {
        subtitle.classList.remove("is-visible");
        subtitle.classList.add("is-hidden");
        return;
      }
      subtitle.textContent = text;
      subtitle.classList.remove("is-hidden");
      subtitle.classList.add("is-visible");
      if (holdMs && holdMs > 0) {
        subtitleTimer = setTimeout(() => {
          subtitle.classList.remove("is-visible");
          subtitle.classList.add("is-hidden");
        }, holdMs);
      }
    }

    // 真鼠标事件（包括 Playwright page.mouse.move 派发的合成事件）→ 驱动虚拟鼠标
    window.addEventListener(
      "pointermove",
      (e) => setPos(e.clientX, e.clientY, false),
      true
    );
    window.addEventListener(
      "pointerdown",
      (e) => {
        setPos(e.clientX, e.clientY, true);
        fireRipple(e.clientX, e.clientY);
      },
      true
    );
    window.addEventListener(
      "pointerup",
      (e) => setPos(e.clientX, e.clientY, false),
      true
    );

    window.__rec = {
      setPos,
      fireRipple,
      showSubtitle,
      getPos: () => ({ x: lastX, y: lastY }),
      version: "0.1.0",
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
