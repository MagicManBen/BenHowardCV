// ==UserScript==
// @name         Indeed Cookie Capture → Supabase
// @namespace    https://checkloops.co.uk
// @version      1.1
// @description  Auto-captures Indeed cookies on login and saves to Supabase for job search dashboard
// @author       Ben Howard
// @match        https://uk.indeed.com/*
// @match        https://secure.indeed.com/*
// @grant        GM_xmlhttpRequest
// @connect      jntpyqguonknixyksqbp.supabase.co
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  var SAVE_URL = "https://jntpyqguonknixyksqbp.supabase.co/functions/v1/save-cookies";
  var CHECK_INTERVAL = 5000; // check every 5s
  var LAST_SAVE_KEY = "bh_indeed_cookie_last_save";

  function getCookieString() {
    return document.cookie;
  }

  function isLoggedIn() {
    // Indeed sets cookies on any visit; just check we have some
    return document.cookie.length > 20;
  }

  function shouldSave() {
    var last = localStorage.getItem(LAST_SAVE_KEY);
    if (!last) return true;
    // Re-save every 10 minutes (was 1 hour)
    return Date.now() - parseInt(last, 10) > 600000;
  }

  function saveCookies() {
    var cookies = getCookieString();
    if (!cookies) return;

    GM_xmlhttpRequest({
      method: "POST",
      url: SAVE_URL,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ source: "indeed", cookies: cookies }),
      onload: function (response) {
        try {
          var data = JSON.parse(response.responseText);
          if (data.ok) {
            localStorage.setItem(LAST_SAVE_KEY, String(Date.now()));
            showNotification("✓ Indeed cookies saved to dashboard");
          }
        } catch (e) {
          console.error("[BH Cookie Capture] Parse error:", e);
        }
      },
      onerror: function (err) {
        console.error("[BH Cookie Capture] Failed to save cookies:", err);
        showNotification("✗ Cookie save failed — check console");
      },
    });
  }

  function showNotification(msg) {
    var el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText =
      "position:fixed;top:10px;right:10px;z-index:999999;background:#155724;" +
      "color:#fff;padding:8px 16px;border-radius:6px;font-size:13px;" +
      "font-family:system-ui;box-shadow:0 2px 8px rgba(0,0,0,0.3);" +
      "transition:opacity 0.3s;";
    document.body.appendChild(el);
    setTimeout(function () {
      el.style.opacity = "0";
      setTimeout(function () { el.remove(); }, 400);
    }, 3000);
  }

  // Initial check
  if (isLoggedIn() && shouldSave()) {
    saveCookies();
  }

  // Periodic check (catches post-login state changes)
  setInterval(function () {
    if (isLoggedIn() && shouldSave()) {
      saveCookies();
    }
  }, CHECK_INTERVAL);
})();
