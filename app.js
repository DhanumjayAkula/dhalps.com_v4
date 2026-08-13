/* Fixed view, no page scroll. Every scroll gesture is one beat of the take:
   the video plays forward from where it stopped to the end of that beat and
   parks there. Scroll up rewinds the same beat. The beats are the moves in the
   footage — the machine zooms in, slides left, a figure walks out and stands,
   the card is dealt over it, then card and figure leave together — measured off
   the frames, not guessed. */

const PROJECTS = [
  {
    tag: 'AI pipeline', title: 'Jimmy AI',
    body: 'An AI pipeline that finds local businesses with bad websites, rebuilds each one, and sends it to the owner to claim.',
  },
  {
    tag: 'Core project', title: 'Sidekick',
    body: 'A master teacher in every tutoring session: each recording becomes a one-minute briefing before the next one.',
  },
  {
    tag: 'Six years', title: 'Efficiency Engine',
    body: '100+ automated sequences run onboarding, matching, comms and data for 6,000+ users, every month.',
  },
  {
    tag: 'Extension', title: 'Neat Freak',
    body: 'Tidies your tabs into workstream folders, nudges you when they pile up, and finds any of them again in plain English.',
  },
];

/* One entry per scroll. `t` is where the video parks, `card` the project whose
   popup is up while it is parked there (-1 = none). The popup costs no scroll of
   its own: the beat that walks a figure out parks on the landing, and the popup
   is dealt there by itself. */
const BEATS = [
  { t: 0.00,  card: -1 },                   // rest: the machine, far off
  { t: 3.38,  card: -1 },                   // the machine slides to the left
  { t: 7.50,  card: 0  },                   // figure is picked, walks out, lands -> popup
  { t: 11.83, card: -1 },                   // popup flies off with the figure
  { t: 15.00, card: 1  },                   // next figure out (motion 13.42–14.50)
  { t: 16.90, card: -1 },                   // …leaves (15.88–16.58)
  { t: 19.40, card: 2  },                   // (17.92–18.88)
  { t: 21.10, card: -1 },                   // (20.13–20.79)
  { t: 24.05, card: 3  },                   // (22.50–23.54)
  { t: 26.70, card: -1 },                   // (25.67–26.42)
  { t: 30.80, card: -1 },                   // the camera pushes inside the cabinet
  { t: 34.67, card: -1 },                   // the claw empties it
  { t: 39.42, card: -1 },                   // …and pulls back out
];

/* The second the figure turns and walks out of frame, per project. The popup is
   held until then and leaves on the same beat, travelling the same way, so the
   two read as one thing going rather than two separate exits. */
const EXITS = [9.89, 15.88, 20.13, 25.67];

const ASPECT  = 16 / 9;
const TOY     = { fx: 0.745, fy: 0.72, h: 0.27 };  // where a figure stands, in frame units
const EPS     = 0.03;                              // seconds; closer than this counts as parked
const RATE    = 1.5;                               // the take is cut slow for a scroll — run it up
const REWIND  = 2.5 * RATE;                        // …and keep the rewind faster than the playback
const NUDGE   = 26;                                // wheel delta that counts as one gesture
const SETTLE  = 120;                               // ms of quiet before the next gesture is taken

const plate = document.getElementById('plate');
const card  = document.getElementById('card');
const hud   = document.getElementById('hud');
const ticks = document.getElementById('ticks');
const label = document.getElementById('cue-label');

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---- the card, parked over the figure ---------------------------------------

const tagEl   = document.getElementById('c-tag');
const titleEl = document.getElementById('c-title');
const bodyEl  = document.getElementById('c-body');

// object-fit: cover — work out where the frame really sits, so the card is
// pinned to the figure rather than to a guessed screen position.
function place() {
  const vw = innerWidth, vh = innerHeight;
  const w = Math.max(vw, vh * ASPECT), h = Math.max(vw / ASPECT, vh);
  const toyX = (vw - w) / 2 + TOY.fx * w;
  const toyTop = (vh - h) / 2 + (TOY.fy - TOY.h * 0.62) * h;   // the figure's head

  const half = card.offsetWidth / 2;
  card.style.left = `${clamp(toyX, half + 20, vw - half - 20).toFixed(0)}px`;
  card.style.top  = `${Math.max(toyTop - 22, card.offsetHeight + 90).toFixed(0)}px`;
}

let lit = -1;
// `fly`: the figure is walking off and the popup goes with it. Without it the
// popup is simply taken down (rewinding, or a jump), which must not look like
// the same move.
function light(i, fly) {
  if (i === lit) return;
  lit = i;
  if (i === -1) {
    card.classList.remove('on');
    card.classList.toggle('gone', !!fly);
    label.textContent = 'SCROLL TO CONTINUE';
  } else {
    card.classList.remove('gone');
    const p = PROJECTS[i];
    tagEl.textContent = p.tag;
    titleEl.textContent = p.title;
    bodyEl.textContent = p.body;
    place();
    card.classList.add('on');
    label.textContent = 'SCROLL FOR NEXT';
  }
  hud.style.opacity = i === -1 ? '1' : '.5';
  tickEls.forEach((el, j) => el.classList.toggle('on', j === i));
}

const tickEls = PROJECTS.map((_, i) => {
  const li = document.createElement('li');
  li.textContent = String(i + 1).padStart(2, '0');
  ticks.append(li);
  return li;
});

// ---- the transport: one beat per gesture ------------------------------------

let beat = 0;      // the beat the footage is parked on (or heading for)
let busy = false;  // …and whether it is still on its way there
let raf = 0;

function go(dir) {
  const n = clamp(beat + dir, 0, BEATS.length - 1);
  if (n === beat) return;
  beat = n;
  drive();
}

function drive() {
  cancelAnimationFrame(raf);
  const target = BEATS[beat].t;
  const gap = target - plate.currentTime;

  if (Math.abs(gap) <= EPS) { park(); return; }

  busy = true;

  if (gap > 0) {
    // the popup stays put until its figure actually starts walking off
    const leaveAt = lit >= 0 ? EXITS[lit] : -1;
    plate.playbackRate = RATE;      // some browsers reset the rate on a source change
    plate.play().catch(() => {});   // forward is real playback, so it never judders
    const fwd = () => {
      if (leaveAt >= 0 && plate.currentTime >= leaveAt) light(-1, true);
      if (plate.currentTime >= target - EPS) return park();
      raf = requestAnimationFrame(fwd);
    };
    raf = requestAnimationFrame(fwd);
  } else {
    light(-1);                      // rewinding: the popup goes at once
    plate.pause();                  // …backwards is a seek, run at a readable speed
    let last = performance.now();
    const back = now => {
      const t = plate.currentTime - ((now - last) / 1000) * REWIND;
      last = now;
      if (t <= target + EPS) return park();
      plate.currentTime = t;
      raf = requestAnimationFrame(back);
    };
    raf = requestAnimationFrame(back);
  }
}

function park() {
  cancelAnimationFrame(raf);
  plate.pause();
  // only snap if we are actually off; forward playback lands within a frame of
  // the mark and seeking back to it would show as a stutter
  if (Math.abs(plate.currentTime - BEATS[beat].t) > EPS) plate.currentTime = BEATS[beat].t;
  busy = false;
  light(BEATS[beat].card);
  tickEls.forEach((el, j) => el.classList.toggle('done', BEATS[beat].t > PROJECTS_END[j]));
}

// the beat after a project's popup is where that project is finished with
const PROJECTS_END = PROJECTS.map((_, i) => BEATS[BEATS.findIndex(b => b.card === i) + 1].t);

// ---- gestures ---------------------------------------------------------------

let acc = 0, quiet = 0;

function intent(d) {
  if (busy || !revealed) return;
  go(d);
}

addEventListener('wheel', e => {
  e.preventDefault();
  if (busy) { acc = 0; return; }
  clearTimeout(quiet);
  quiet = setTimeout(() => { acc = 0; }, SETTLE);   // leftover momentum is not a new gesture
  acc += e.deltaY;
  if (Math.abs(acc) >= NUDGE) { const d = Math.sign(acc); acc = 0; intent(d); }
}, { passive: false });

addEventListener('keydown', e => {
  const d = { ArrowDown: 1, PageDown: 1, ' ': 1, ArrowUp: -1, PageUp: -1 }[e.key];
  if (d === undefined) return;
  if (e.target.closest('a')) return;      // let the card's link take Enter/Space
  e.preventDefault();
  intent(d);
});

let touchY = null;
addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive: true });
addEventListener('touchmove', e => {
  if (touchY === null) return;
  const dy = touchY - e.touches[0].clientY;
  if (Math.abs(dy) > 40) { touchY = null; intent(Math.sign(dy)); }
}, { passive: true });
addEventListener('touchend', () => { touchY = null; });

addEventListener('resize', place, { passive: true });

// ---- loader -----------------------------------------------------------------
/* The whole file is downloaded before the page is shown, and then handed to the
   <video> as a blob. That is the difference between "mostly buffered" and
   "here": a plain src leaves the browser free to fetch in dribs, and every beat
   that runs into a gap stalls mid-move. Once it is a blob there is no network
   left in the loop — playback and the rewind seeks are all out of memory. */

const SRC = 'video.mp4';

const loader = document.getElementById('loader');
const bar = document.getElementById('bar');
const pct = document.getElementById('pct');
let revealed = false;

function progress(p) {
  bar.style.setProperty('--p', p.toFixed(3));
  pct.textContent = `${Math.round(p * 100)}%`;
}

function reveal() {
  if (revealed) return;
  revealed = true;
  progress(1);
  loader.classList.add('gone');
  document.documentElement.classList.remove('loading');
  loader.addEventListener('transitionend', () => loader.remove(), { once: true });
  park();
}

// hold until the video element has the first frame of the blob decoded, so the
// page never appears on an empty <video>
function handOver(url) {
  plate.addEventListener('loadeddata', reveal, { once: true });
  plate.addEventListener('error', reveal, { once: true });
  plate.src = url;
  plate.load();
}

async function download() {
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(res.status);

  const total = Number(res.headers.get('content-length')) || 0;
  const chunks = [];
  let got = 0;

  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total) progress(clamp(got / total, 0, 1));
  }
  handOver(URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' })));
}

// no streams, no fetch, or the file simply is not there: fall back to letting
// the element load it the ordinary way rather than hanging on a blank page
download().catch(() => handOver(SRC));

// ---- self-check: #selftest ---------------------------------------------------
if (location.hash === '#selftest') {
  let ok = true;
  BEATS.forEach((b, i) => {
    if (i && b.t <= BEATS[i - 1].t) ok = false;                 // beats only run forward
    if (b.card !== -1 && !PROJECTS[b.card]) ok = false;
  });
  PROJECTS.forEach((_, i) => {
    if (BEATS.filter(b => b.card === i).length !== 1) ok = false;  // one popup beat each
    // the popup's exit has to fall inside the beat it leaves on, or it would go
    // either before the scroll or after the footage has already parked
    const j = BEATS.findIndex(b => b.card === i);
    if (!(EXITS[i] > BEATS[j].t && EXITS[i] < BEATS[j + 1].t)) ok = false;
  });
  if (BEATS[0].t !== 0) ok = false;
  console.assert(ok, 'beat list broken');
  console.log(ok ? `selftest ok — ${BEATS.length - 1} scrolls` : 'selftest FAILED');
}
