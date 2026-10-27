// The game shell: one GameSession runs consecutive levels of a game and provides
// every game module with the same header, host, hints, timer, scoring, teams,
// result screen, reporting and keyboard shortcuts.
import { h, clear, toast, modal, shake, confetti, countUp, cap, toggleFullscreen, sleep, flash } from './ui.js';
import { api } from './api.js';
import { audio } from './audio/engine.js';
import { host } from './host.js';
import { store } from './store.js';
import { loadGame } from './games/registry.js';

const TIMER_MULT = { easy: 1, medium: 1.25, hard: 1.5, expert: 2, insane: 2.5 };

/**
 * Context handed to game modules (see games/README.md):
 *   act(action, payload) -> server result (common fields handled automatically)
 *   hint(), giveUp(), say(textOrKind), sfx(name), toast(msg), setStat(key, label, value)
 *   audio, difficulty, level, mode, view, round, settings, reducedMotion
 */
export class GameSession {
  constructor(root, { meta, difficulty, challengeId = null, options = {}, shuffle = null, onExit }) {
    this.root = root;
    this.meta = meta;
    this.difficulty = difficulty;
    this.challengeId = challengeId;
    this.options = options;
    this.shuffle = shuffle;
    this.onExit = onExit;
    this.sessionScore = 0;
    this.runLength = 0;
    this.instance = null;
    this.timerId = null;
    this.overlay = null;
    this.destroyed = false;
    this.onKey = this.onKey.bind(this);
    document.addEventListener('keydown', this.onKey);
    this.build();
  }

  build() {
    const s = store.settings;
    this.chips = h('div', { class: 'chips' });
    this.customChips = h('div', { class: 'chips' });
    this.teamChips = h('div', { class: 'chips team-chips' });
    this.muteBtn = h('button', { class: 'btn icon ghost', title: 'Mute (M)', 'aria-label': 'Mute', onclick: () => this.toggleMute() }, s.audio.muted ? '🔇' : '🔊');
    this.hintBtn = h('button', { class: 'btn sm', title: 'Hint (H)', onclick: () => this.hint() }, '💡 Hint ', h('span', { class: 'kbd' }, 'H'));
    const top = h('header', { class: 'play-top' },
      h('button', { class: 'btn sm ghost', onclick: () => this.exit(), title: 'Back (Esc)' }, this.shuffle ? '⟵ Exit shuffle' : '⟵ Home'),
      h('div', { class: 'play-title' }, h('span', { class: 'emoji' }, this.meta.emoji), h('span', {}, this.meta.title)),
      this.chips, this.customChips, this.teamChips,
      h('div', { class: 'top-actions' },
        this.hintBtn,
        h('button', { class: 'btn sm ghost', title: 'Give up and reveal', onclick: () => this.confirmGiveUp() }, '🏳️ Reveal'),
        h('button', { class: 'btn sm ghost', title: 'Report a problem with this challenge', onclick: () => this.report() }, '🚩'),
        h('button', { class: 'btn icon ghost', title: 'Fullscreen (F)', 'aria-label': 'Fullscreen', onclick: toggleFullscreen }, '⛶'),
        this.muteBtn),
    );
    this.hostText = h('div', { class: 'host-text' });
    this.hostFace = h('div', { class: 'host-face emoji', 'aria-hidden': 'true' }, '🎙️');
    this.hostBubble = h('div', { class: `host-bubble panel ${s.host.enabled ? '' : 'hidden'}` }, this.hostFace, this.hostText);
    this.howBar = h('section', { class: 'howbar panel', 'aria-label': 'How to play' });
    this.stage = h('main', { class: 'stage' });
    this.hintTray = h('div', { class: 'hint-tray', 'aria-live': 'polite' });
    clear(this.root).append(h('div', { class: 'play' }, top, this.howBar, this.hostBubble, this.stage));
    host.attach(this.hostText, this.hostFace);
  }

  renderChips() {
    const r = this.round;
    const chip = (label, value, cls = '') => h('span', { class: `chip ${cls}` }, h('small', {}, label), value);
    const items = [];
    if (this.shuffle) items.push(chip('Round', this.shuffle.label));
    items.push(chip('Level', String(this.level)));
    items.push(h('span', { class: `pill diff-pill diff-${this.round?.difficulty || this.difficulty}` }, cap(this.round?.difficulty || this.difficulty)));
    this.scoreEl = h('b', {}, (this.shuffle ? this.shuffle.score + this.sessionScore : this.sessionScore).toLocaleString());
    items.push(chip('Score', this.scoreEl, 'score'));
    if (r?.mistakesAllowed) {
      const left = Math.max(0, r.mistakesAllowed - (this.mistakes || 0));
      items.push(chip('Lives', h('span', { class: 'hearts' }, '❤️'.repeat(left) + '🖤'.repeat(r.mistakesAllowed - left))));
    } else if (this.mistakes) items.push(chip('Misses', String(this.mistakes)));
    if (this.hintsUsed) items.push(chip('Hints', String(this.hintsUsed)));
    if (this.mode === 'hardcore') items.push(chip('Run', String(this.runLength)));
    this.timerEl = store.settings.timer.enabled ? chip('Time', '--:--', 'timer') : null;
    if (this.timerEl) items.push(this.timerEl);
    this.chips.replaceChildren(...items);
    const t = store.settings.teams;
    this.teamChips.replaceChildren(...(t.enabled ? t.list.map((team, i) => chip(team.name, h('b', {}, team.score.toLocaleString()), i === t.active % t.list.length ? 'active' : '')) : []));
  }

  setStat(key, label, value) {
    this.custom ||= new Map();
    if (value == null) this.custom.delete(key);
    else this.custom.set(key, [label, value]);
    this.customChips.replaceChildren(...[...this.custom.values()].map(([l, v]) => h('span', { class: 'chip' }, h('small', {}, l), String(v))));
  }

  async startLevel() {
    this.closeOverlay();
    this.stopTimer();
    this.instance?.destroy?.();
    this.instance = null;
    this.custom = new Map();
    this.customChips.replaceChildren();
    this.mistakes = 0;
    this.hintsUsed = 0;
    this.finished = false;
    this.mode = store.settings.mode;
    this.level = store.levelNumber(this.meta.id, this.difficulty);
    clear(this.stage).append(h('div', { class: 'loading' }, h('div', { class: 'spinner' }), h('div', { class: 'muted' }, 'Preparing your mystery...'), h('div', { class: 'credit' }, 'Made by Gedalia G')));
    clear(this.hintTray);
    const intro = this.introShown ? null : this.showIntroCard();
    this.introShown = true;
    let mod;
    try {
      [mod, this.round] = await Promise.all([
        loadGame(this.meta.id),
        api.start({ game: this.meta.id, difficulty: this.difficulty, mode: this.mode, exclude: store.played(this.meta.id), challengeId: this.challengeId, options: this.options }),
      ]);
      await intro;
    } catch (err) {
      clear(this.stage).append(h('div', { class: 'loading' },
        h('div', { class: 'emoji', style: { fontSize: '4rem' } }, '🛠️'),
        h('h2', {}, 'This mystery could not load'),
        h('p', { class: 'muted' }, err.message),
        h('div', { class: 'row', style: { justifyContent: 'center' } },
          h('button', { class: 'btn primary', onclick: () => this.startLevel() }, 'Try again'),
          h('button', { class: 'btn', onclick: () => this.exit() }, 'Back'))));
      return;
    }
    if (this.destroyed) return;
    this.challengeId = null; // only the first level of a "play this challenge" link is fixed
    this.module = mod;
    this.renderHowTo(mod);
    this.renderChips();
    clear(this.stage);
    const levelStart = Date.now();
    this.levelStart = levelStart;
    store.setLast({ game: this.meta.id, difficulty: this.difficulty });
    audio.setMood(mod.music || 'thinking');
    audio.sting('level');
    const hard = ['hard', 'expert', 'insane'].includes(this.round.difficulty);
    host.say(hard ? 'startHard' : 'start', { level: this.level, difficulty: cap(this.round.difficulty) });
    const ctx = this.makeContext();
    try {
      this.instance = mod.mount(this.stage, this.round.view, ctx) || {};
    } catch (err) {
      console.error(err);
      this.stage.append(h('p', { class: 'feedback bad' }, 'Something went wrong showing this level.'));
    }
    this.stage.append(this.hintTray);
    this.startTimer();
  }

  /** Title card shown when a game first opens. Resolves after a short beat, or right away on click. */
  showIntroCard() {
    return new Promise((resolve) => {
      const card = h('div', { class: 'intro-card', style: { '--accent': this.meta.accent }, role: 'presentation' },
        h('div', { class: 'intro-inner' },
          h('div', { class: 'intro-emoji emoji' }, this.meta.emoji),
          h('h1', { class: 'intro-title' }, this.meta.title),
          this.meta.tagline ? h('div', { class: 'intro-tag' }, this.meta.tagline) : null,
          h('div', { class: 'intro-credit' }, 'Made by Gedalia G')));
      let timer = null;
      const done = () => {
        clearTimeout(timer);
        card.classList.add('out');
        setTimeout(() => card.remove(), 400);
        resolve();
      };
      timer = setTimeout(done, store.settings.reducedMotion ? 700 : 1700);
      card.addEventListener('click', done);
      document.body.append(card);
    });
  }

  /** The how-to-play strip at the top of every game (collapsible; the choice is remembered). */
  renderHowTo(mod) {
    const steps = mod.howToFor?.(this.round.view) || mod.howTo || [this.meta.description];
    const list = h('ol', { class: 'howbar-steps' }, steps.map((t) => h('li', {}, t)));
    const toggle = h('button', { class: 'btn sm ghost', type: 'button' });
    const apply = (open) => {
      list.classList.toggle('hidden', !open);
      this.howBar.classList.toggle('closed', !open);
      toggle.textContent = open ? 'Hide ▴' : 'Show ▾';
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => {
      const open = list.classList.contains('hidden');
      store.setSettings({ showHowTo: open });
      apply(open);
    });
    this.howBar.replaceChildren(
      h('div', { class: 'howbar-head' }, h('span', { class: 'howbar-title' }, '📖 How to play'), h('span', { class: 'howbar-game' }, this.meta.title), h('span', { class: 'grow' }), toggle),
      list);
    apply(store.settings.showHowTo !== false);
  }

  makeContext() {
    const session = this;
    return {
      get difficulty() { return session.round.difficulty; },
      get level() { return session.level; },
      get mode() { return session.mode; },
      get view() { return session.round.view; },
      get round() { return session.round; },
      get finished() { return session.finished; },
      settings: store.settings,
      audio,
      reducedMotion: document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches,
      act: (action, payload) => session.act(action, payload),
      hint: () => session.hint(),
      giveUp: () => session.confirmGiveUp(),
      say: (t, vars) => host.say(t, vars),
      sfx: (n) => audio.sfx(n),
      toast,
      setStat: (k, l, v) => session.setStat(k, l, v),
      shakeStage: () => shake(session.stage),
      flashStage: () => flash(session.stage),
    };
  }

  async act(action, payload = {}) {
    if (!this.round || this.destroyed) return { ok: false };
    let res;
    try {
      res = await api.action(this.round.roundId, action, payload);
    } catch (err) {
      if (err.status === 410) {
        toast(err.message, 'bad');
        setTimeout(() => this.startLevel(), 1200);
      } else toast(err.message, 'bad');
      return { ok: false, error: err.message };
    }
    if (this.destroyed) return res;
    if (res.blocked) toast(res.message || "Let's keep it classroom-friendly!", 'bad');
    if (res.hint) this.showHint(res.hint);
    if (res.mistake) {
      this.mistakes = res.mistakes;
      this.renderChips();
      if (!res.failed) {
        audio.sfx('wrong');
        shake(this.stage);
        host.say(res.close ? 'close' : 'wrong');
      }
    } else if (res.correct === false && res.close) host.say('close');
    if (res.solved) this.finish('win', res);
    else if (res.failed) this.finish('lose', res);
    else if (res.skipped) this.finish('skip', res);
    return res;
  }

  async hint() {
    if (!this.round || this.finished) return;
    const res = await this.act('hint');
    if (res.ok && !res.hint) toast(res.message || 'No more hints!');
  }

  showHint(hint) {
    this.hintsUsed += 1;
    this.renderChips();
    audio.sfx('hint');
    host.say('hint');
    this.hintTray.append(h('div', { class: 'hint-card' }, h('b', {}, `Hint ${hint.index}${hint.total ? `/${hint.total}` : ''}`), hint.text));
    this.instance?.onHint?.(hint);
  }

  confirmGiveUp() {
    if (!this.round || this.finished) return;
    const m = modal({
      title: 'Reveal the answer?',
      body: h('p', { class: 'muted' }, 'This ends the level with no points.'),
      actions: [
        { label: 'Keep trying', onClick: (close) => close() },
        { label: 'Reveal it', primary: true, onClick: (close) => { close(); host.say('giveup'); this.act('giveup'); } },
      ],
    });
    return m;
  }

  report() {
    if (!this.round) return;
    let reason = 'wrong-answer';
    const note = h('textarea', { class: 'input', rows: 3, maxlength: 500, placeholder: 'Optional: what is the problem?' });
    const reasons = [['inappropriate', 'Not appropriate'], ['wrong-answer', 'Answer seems wrong'], ['broken', 'Something is broken'], ['too-hard', 'Unfair / too hard'], ['other', 'Other']];
    const seg = h('div', { class: 'seg' }, reasons.map(([v, l]) => h('button', { class: v === reason ? 'on' : '', onclick: (e) => { reason = v; [...seg.children].forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); } }, l)));
    modal({
      title: '🚩 Report this challenge',
      body: h('div', {}, h('p', { class: 'muted' }, 'Reports go to the teacher/admin dashboard. "Not appropriate" reports pull the challenge from rotation until it is reviewed.'), seg, h('div', { class: 'field' }, note)),
      actions: [{ label: 'Send report', primary: true, onClick: async (close) => {
        try {
          const r = await api.report({ challengeId: this.round.challengeId, reason, note: note.value });
          toast(r.message, 'good');
          close();
        } catch (err) { toast(err.message, 'bad'); }
      } }],
    });
  }

  // ---------------- timer ----------------
  startTimer() {
    if (!store.settings.timer.enabled || !this.timerEl) return;
    const total = Math.round(store.settings.timer.seconds * (TIMER_MULT[this.round.difficulty] || 1));
    const end = Date.now() + total * 1000;
    let lastWhole = null;
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      if (left === lastWhole) return;
      lastWhole = left;
      const val = this.timerEl.lastChild;
      val.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      this.timerEl.classList.toggle('low', left <= 10);
      if (left === 10) {
        audio.setMood('tension');
        host.say('timeLow');
      }
      if (left === 5) audio.setMood('countdown');
      if (left <= 5 && left > 0) audio.sfx('countdown');
      if (left === 0) {
        this.stopTimer();
        audio.setMood(this.module?.music || 'thinking');
        if (this.mode === 'classroom') host.say('timeUpClassroom');
        else {
          host.say('timeUp');
          this.act('timeout');
        }
      }
    };
    tick();
    this.timerId = setInterval(tick, 200);
  }

  stopTimer() {
    clearInterval(this.timerId);
    this.timerId = null;
  }

  // ---------------- results ----------------
  async finish(outcome, res) {
    if (this.finished) return;
    this.finished = true;
    this.stopTimer();
    const seconds = Math.round((Date.now() - this.levelStart) / 1000);
    const points = res.score?.total || 0;
    store.markPlayed(this.meta.id, this.round.challengeId);
    store.recordResult(this.meta.id, this.round.difficulty, { solved: outcome === 'win', points, hints: this.hintsUsed, mistakes: this.mistakes, seconds });
    let team = null;
    if (outcome === 'win') {
      this.sessionScore += points;
      this.runLength += 1;
      team = store.addTeamPoints(points);
      audio.sting('victory');
      confetti();
      const fast = res.score?.lines?.some((l) => /fast/i.test(l.label));
      host.say(fast ? 'solvedFast' : this.hintsUsed === 0 ? 'solvedNoHint' : 'solved');
    } else if (outcome === 'lose') {
      audio.sting('fail');
      host.say('failed');
    }
    audio.setMood('silent');
    try {
      await this.instance?.onFinish?.(outcome, res);
    } catch (err) {
      console.error(err);
    }
    if (this.destroyed) return;
    await sleep(outcome === 'win' ? 700 : 400);
    this.showResult(outcome, res, team);
  }

  showResult(outcome, res, team) {
    const reveal = res.reveal || {};
    const runOver = outcome === 'lose' && res.runOver;
    const title = outcome === 'win' ? 'CORRECT!' : runOver ? 'RUN OVER' : outcome === 'skip' ? 'SKIPPED' : res.timeout ? "TIME'S UP" : 'NOT THIS TIME';
    const pointsEl = h('span', {}, '0');
    const slot = h('div', { class: 'reveal-slot' });
    const next = () => {
      store.nextTeam();
      if (this.shuffle) this.shuffle.onNext({ outcome, points: res.score?.total || 0, runOver });
      else {
        if (runOver) this.runLength = 0;
        this.startLevel();
      }
    };
    const nextLabel = this.shuffle ? (this.shuffle.isLast ? 'See final score ▶' : 'Next round ▶') : runOver ? 'Start a new run ▶' : 'Next level ▶';
    const box = h('div', { class: `result panel ${outcome === 'win' ? 'win' : 'lose'}` },
      h('h1', { class: 'result-title' }, title),
      outcome === 'win' ? h('div', { class: 'points' }, '+', pointsEl, ' POINTS') : null,
      team ? h('div', { class: 'muted' }, `Points go to ${team.name}!`) : null,
      outcome === 'win' && res.score ? h('div', { class: 'breakdown' }, res.score.lines.flatMap((l) => [h('span', {}, l.label), h('span', {}, `${l.points > 0 ? '+' : ''}${l.points}`)])) : null,
      runOver ? h('div', { class: 'muted' }, `Hardcore run: ${this.runLength} level${this.runLength === 1 ? '' : 's'} survived.`) : null,
      reveal.answer ? h('div', { class: 'answer-big' }, reveal.emoji ? h('span', { class: 'emoji' }, reveal.emoji) : null, outcome === 'win' ? reveal.answer : `The answer: ${reveal.answer}`) : null,
      reveal.explanation ? h('p', { class: 'explain' }, reveal.explanation) : null,
      slot,
      h('div', { class: 'result-actions' },
        h('button', { class: 'btn primary big', onclick: next }, nextLabel, ' ', h('span', { class: 'kbd' }, 'N')),
        h('button', { class: 'btn', onclick: () => this.exit() }, this.shuffle ? 'Exit shuffle' : 'Home')),
    );
    this.overlay = h('div', { class: 'overlay' }, box);
    this.overlayNext = next;
    document.body.append(this.overlay);
    if (outcome === 'win') countUp(pointsEl, res.score?.total || 0, 1300);
    try {
      this.module?.renderReveal?.(slot, reveal, outcome);
    } catch (err) {
      console.error(err);
    }
    audio.sfx('reveal');
    setTimeout(() => box.querySelector('.btn.primary')?.focus(), 100);
    const t = store.settings.teams;
    if (t.enabled && t.list.length > 1) setTimeout(() => host.say('team', { team: t.list[(t.active + 1) % t.list.length].name }, { speak: false }), 1600);
  }

  closeOverlay() {
    this.overlay?.remove();
    this.overlay = null;
    this.overlayNext = null;
  }

  // ---------------- misc ----------------
  toggleMute() {
    const muted = audio.toggleMute();
    this.muteBtn.textContent = muted ? '🔇' : '🔊';
    toast(muted ? 'Sound muted' : 'Sound on');
  }

  onKey(e) {
    if (document.querySelector('.modal-back')) return;
    const tag = e.target.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
    if (this.overlay) {
      if ((e.key === 'n' || e.key === 'N' || e.key === 'Enter') && !typing) {
        e.preventDefault();
        this.overlayNext?.();
      } else if (e.key === 'Escape') this.exit();
      return;
    }
    if (typing) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.instance?.onKey?.(e)) {
      e.preventDefault();
      return;
    }
    switch (e.key) {
      case 'f': case 'F': toggleFullscreen(); break;
      case 'm': case 'M': this.toggleMute(); break;
      case 'h': case 'H': this.hint(); break;
      case 'Escape': this.exit(); break;
      case '?': showShortcuts(); break;
      default: return;
    }
    e.preventDefault();
  }

  exit() {
    this.destroy();
    this.onExit?.();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopTimer();
    this.closeOverlay();
    try {
      this.instance?.destroy?.();
    } catch { /* ignore */ }
    document.removeEventListener('keydown', this.onKey);
    host.detach();
    window.speechSynthesis?.cancel();
  }
}

export function showShortcuts() {
  const rows = [['F', 'Fullscreen'], ['M', 'Mute / unmute'], ['H', 'Hint'], ['Enter', 'Submit a guess'], ['N', 'Next level (on the results screen)'], ['Esc', 'Back / close'], ['?', 'This list'],
    ['Space', 'Play / replay (sound and video games)'], ['1-6', 'Pick a picture (Find the Fake)']];
  modal({ title: '⌨️ Keyboard shortcuts', body: h('div', { class: 'breakdown', style: { display: 'grid' } }, rows.flatMap(([k, d]) => [h('span', {}, h('span', { class: 'kbd' }, k)), h('span', {}, d)])) });
}
