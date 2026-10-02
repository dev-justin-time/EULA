const canvas = document.getElementById("stars");
const ctx = canvas.getContext("2d");
const crawl = document.getElementById("crawl");
let W, H, DPR;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function makeStars() {
  const stars = [];
  const count = Math.round((W * H) / 1400);
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.4 + 0.2,
      tw: Math.random() * Math.PI * 2,
      sp: Math.random() * 0.02 + 0.004,
    });
  }
  return stars;
}

let stars = makeStars();

function drawStars() {
  ctx.clearRect(0, 0, W, H);
  for (const s of stars) {
    s.tw += s.sp;
    const alpha = 0.35 + Math.abs(Math.sin(s.tw)) * 0.65;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(210, 225, 255, ${alpha})`;
    ctx.fill();
  }
}

function loop() {
  drawStars();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ============================================================
// STANDALONE LOGIC — Crawl ↔ Audio playback sync
// Self-contained: measures the full text and the song length, then
// drives the crawl so it lasts exactly one playthrough and consumes
// every line before the loop restarts.
// ============================================================
(function initCrawlPlayback() {
  const content = crawl.querySelector(".content");
  const musicEl = document.getElementById("music");
  const startBtn = document.getElementById("startBtn");

  function measureDistance() {
    // scrollHeight is the laid-out text height and ignores the 3D
    // tilt/perspective, so the whole text clears the viewport before reset.
    const textHeight = content.scrollHeight || content.offsetHeight;
    const viewportHeight = crawl.clientHeight || window.innerHeight;
    return textHeight + viewportHeight;
  }

  function applyDistance() {
    content.style.setProperty("--dist", (-measureDistance()).toFixed(1) + "px");
  }

  function applyDuration() {
    const dur = musicEl.duration;
    if (dur && isFinite(dur) && dur > 0) {
      content.style.setProperty("--dur", dur.toFixed(2) + "s");
    }
  }

  function startPlayback() {
    if (crawl.classList.contains("run")) return; // idempotent
    applyDistance();
    applyDuration();
    crawl.classList.add("run");
    startBtn.classList.add("hidden");
    document.getElementById("mute").classList.remove("hidden");
    musicEl.volume = 0.6;
    getAnalyser();
    musicEl.play().catch(() => {});
  }

  // Prepare distance + duration as soon as metadata is ready (no autoplay).
  musicEl.addEventListener("loadedmetadata", () => { applyDistance(); applyDuration(); });
  if (musicEl.readyState >= 1) { applyDistance(); applyDuration(); }

  // Start everything on the user's click (satisfies the autoplay policy).
  startBtn.addEventListener("click", startPlayback);

  // Re-measure when the viewport or fonts change.
  window.addEventListener("resize", applyDistance);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(applyDistance);
  }
})();

const music = document.getElementById("music");
const muteBtn = document.getElementById("mute");
let analyser = null;
let data = null;

function getAnalyser() {
  if (analyser) {
    if (analyser.context.state === "suspended") analyser.context.resume();
    return;
  }
  try {
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    const src = actx.createMediaElementSource(music);
    analyser = actx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.7;
    src.connect(analyser);
    analyser.connect(actx.destination);
    data = new Uint8Array(analyser.frequencyBinCount);
    if (actx.state === "suspended") actx.resume();
  } catch (e) {
    console.warn("Audio analyser unavailable", e);
  }
}

muteBtn.addEventListener("click", () => {
  getAnalyser();
  if (music.paused) {
    music.play();
    muteBtn.textContent = "🔊";
  } else {
    music.pause();
    muteBtn.textContent = "🔇";
  }
});

// ---- Audio-reactive rainbow sine wave overlay ----
const waveCanvas = document.getElementById("wave");
const wctx = waveCanvas.getContext("2d");
let wW, wH;

function resizeWave() {
  const dp = Math.min(window.devicePixelRatio || 1, 2);
  wW = window.innerWidth;
  wH = window.innerHeight;
  waveCanvas.width = wW * dp;
  waveCanvas.height = wH * dp;
  wctx.setTransform(dp, 0, 0, dp, 0, 0);
}
window.addEventListener("resize", resizeWave);
resizeWave();

const waves = 5;
let hueBase = 0;

function drawWave() {
  wctx.clearRect(0, 0, wW, wH);

  let intensity = 0.4;
  if (data) {
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 255;
      sum += v * v;
    }
    intensity = Math.min(1, Math.sqrt(sum / data.length) * 2.2);
  }

  const ampBase = (intensity * Math.min(wH * 0.15, 110) + 6) * 0.25;

  for (let k = 0; k < waves; k++) {
    const phase = k * 0.9;
    const waveFreq = 0.014 + k * 0.008;
    const speed = 1.1 + k * 0.5;
    const ampMult = 0.25 + k * 0.6;
    const step = 6;
    const t = performance.now() * 0.001;

    wctx.beginPath();
    for (let x = 0; x <= wW; x += step) {
      const y = wH * 0.72 +
        Math.sin(x * waveFreq + t * speed + phase) * ampBase * ampMult +
        Math.sin(x * 0.011 - t * speed * 1.3 + phase * 2) * ampBase * ampMult * 0.5;
      if (x === 0) wctx.moveTo(x, y);
      else wctx.lineTo(x, y);
    }
    wctx.strokeStyle = `hsla(${(hueBase + k * 92) % 360}, 95%, 60%, 0.5)`;
    wctx.lineWidth = intensity * 3 + 1;
    wctx.stroke();
  }

  hueBase = (hueBase + 0.5) % 360;
  requestAnimationFrame(drawWave);
}
drawWave();

// ---- Offline support: register the service worker ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .catch((err) => console.warn("Service worker registration failed:", err));
  });
}
