// Game 2 client: AI Password, a secure-terminal interrogation.
import { h, sleep } from '../ui.js';

const MOOD_LABEL = { idle: 'LISTENING', thinking: 'PROCESSING', amused: 'AMUSED', alarmed: 'ALERT', impressed: 'IMPRESSED', defeated: 'OVERRIDDEN' };

export default {
  id: 'password',
  music: 'terminal',
  howTo: [
    'A mysterious AI guards a secret password. Ask it questions out loud as a team, then type them in.',
    'It always tells the truth... but never the password. Try asking about letters, length, what it is, or where it is found.',
    'Think you know it? Type it into the password box. Wrong entries cost points (and lives in Challenge mode).',
    'Challenge and Hardcore modes give you a limited number of questions. Insane vaults have two layers!',
  ],

  mount(el, view, ctx) {
    let busy = false;
    let stage = view.stage || 0;
    let numeric = view.numeric;
    let lengths = view.wordLengths || (view.length ? [view.length] : null);
    let typing = Promise.resolve();
    let destroyed = false;

    // ----- AI avatar -----
    const pupil = h('div', { class: 'pw-pupil' });
    const ai = h('div', { class: 'pw-ai', 'data-mood': 'idle' },
      h('div', { class: 'pw-eye' }, h('div', { class: 'pw-lid' }), h('div', { class: 'pw-iris' }, pupil)),
      h('div', { class: 'pw-ai-name' }, view.persona),
      h('div', { class: 'pw-ai-state' }, 'LISTENING'));
    const setMood = (m) => {
      ai.dataset.mood = m || 'idle';
      ai.lastChild.textContent = MOOD_LABEL[m] || 'LISTENING';
    };

    // ----- header chips -----
    const qChip = h('span', { class: 'pw-chip' });
    const layerChip = view.stages > 1 ? h('span', { class: 'pw-chip pw-layer' }) : null;
    const renderChips = (used = 0) => {
      qChip.textContent = view.limit ? `Q ${used}/${view.limit}` : `Q ${used}`;
      if (layerChip) layerChip.textContent = `LAYER ${stage + 1}/${view.stages}`;
      ctx.setStat('q', 'Questions', view.limit ? `${used}/${view.limit}` : String(used));
    };

    // ----- chat log -----
    const log = h('div', { class: 'pw-log', role: 'log', 'aria-live': 'polite' });
    const scroll = () => (log.scrollTop = log.scrollHeight);
    const addLine = (who, text) => {
      const body = h('span', { class: 'pw-text' });
      const line = h('div', { class: `pw-line pw-l-${who}` }, h('span', { class: 'pw-who' }, who === 'you' ? 'YOU>' : who === 'ai' ? `${view.persona}>` : 'SYS>'), body);
      log.append(line);
      scroll();
      return body;
    };
    const say = (text, who = 'ai') => {
      typing = typing.then(async () => {
        if (destroyed) return;
        const body = addLine(who, '');
        if (ctx.reducedMotion || text.length > 400) {
          body.textContent = text;
        } else {
          body.classList.add('typing');
          for (let i = 1; i <= text.length; i += 2) {
            body.textContent = text.slice(0, i);
            if (i % 8 === 1) ctx.sfx('type');
            scroll();
            await sleep(16);
            if (destroyed) return;
          }
          body.textContent = text;
          body.classList.remove('typing');
        }
        scroll();
      });
      if (who === 'ai' && ctx.settings.host.voice) ctx.audio.speak(text);
      return typing;
    };

    // ----- ask form -----
    const askInput = h('input', { class: 'pw-input', placeholder: 'Ask the vault a question...', maxlength: 300, autocomplete: 'off', 'aria-label': 'Ask the vault a question' });
    const askBtn = h('button', { class: 'pw-btn', type: 'submit' }, 'ASK');
    const askForm = h('form', { class: 'pw-ask', onsubmit: (e) => { e.preventDefault(); send(); } }, h('span', { class: 'pw-prompt' }, '>'), askInput, askBtn);

    async function send() {
      const text = askInput.value.trim();
      if (!text || busy || ctx.finished) return;
      busy = true;
      askBtn.disabled = true;
      askInput.value = '';
      addLine('you', '').textContent = text;
      setMood('thinking');
      const res = await ctx.act('chat', { text });
      busy = false;
      askBtn.disabled = false;
      if (res.ok === false) {
        setMood('idle');
        if (res.message && !res.blocked) say(res.message, 'sys');
        if (res.outOfQuestions) lockAsk();
        return;
      }
      if (res.solved) {
        say('ACCESS GRANTED.', 'sys');
        return;
      }
      if (res.stageCleared) return stageCleared(res);
      setMood(res.mood);
      if (res.progress === 'close') ctx.say('Ooh, the vault looks nervous. You\'re close!');
      renderChips(res.questionsUsed);
      if (res.revealLength && !lengths) setBoxes(res.wordLengths || [res.revealLength]);
      await say(res.reply);
      if (res.finalAttempt) {
        lockAsk();
        entryInput.focus();
      } else if (!ctx.finished) askInput.focus();
    }

    function lockAsk() {
      askInput.disabled = true;
      askBtn.disabled = true;
      askInput.placeholder = 'No questions left. Enter the password!';
    }

    // ----- password entry -----
    const boxes = h('div', { class: 'pw-boxes', 'aria-hidden': 'true' });
    const entryInput = h('input', { class: 'pw-entry-input', autocomplete: 'off', spellcheck: 'false', maxlength: 60, 'aria-label': 'Password' });
    const unlockBtn = h('button', { class: 'pw-btn pw-unlock', type: 'submit' }, '🔓 UNLOCK');
    const feedback = h('div', { class: 'pw-feedback', 'aria-live': 'assertive' });
    const boxWrap = h('div', { class: 'pw-boxwrap', onclick: () => entryInput.focus() }, boxes, entryInput);
    const entry = h('div', { class: 'pw-entry' },
      h('div', { class: 'pw-entry-label' }, 'ENTER PASSWORD', layerChip ? h('span', { class: 'pw-entry-layer' }) : null),
      h('form', { class: 'pw-entry-form', onsubmit: (e) => { e.preventDefault(); unlock(); } }, boxWrap, unlockBtn),
      feedback);

    function setBoxes(list) {
      lengths = list && list.length ? list : null;
      entryInput.setAttribute('inputmode', numeric ? 'numeric' : 'text');
      entryInput.placeholder = lengths ? '' : numeric ? 'Type the number...' : 'Type the password...';
      boxWrap.classList.toggle('pw-free', !lengths);
      boxes.replaceChildren(...(lengths || []).map((n, w) => h('div', { class: 'pw-word' }, Array.from({ length: n }, (_, i) => h('span', { class: 'pw-box', dataset: { w, i } })))));
      paintBoxes();
    }

    function paintBoxes() {
      if (!lengths) return;
      const chars = entryInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').split('');
      const all = [...boxes.querySelectorAll('.pw-box')];
      all.forEach((b, i) => {
        b.textContent = chars[i] || '';
        b.classList.toggle('filled', !!chars[i]);
        b.classList.toggle('active', document.activeElement === entryInput && i === Math.min(chars.length, all.length - 1));
      });
    }
    entryInput.addEventListener('input', paintBoxes);
    entryInput.addEventListener('focus', paintBoxes);
    entryInput.addEventListener('blur', paintBoxes);

    async function unlock() {
      const value = entryInput.value.trim();
      if (!value || busy || ctx.finished) return;
      busy = true;
      unlockBtn.disabled = true;
      feedback.className = 'pw-feedback';
      feedback.textContent = 'VERIFYING...';
      const res = await ctx.act('enter', { password: value });
      busy = false;
      unlockBtn.disabled = false;
      if (res.ok === false) {
        feedback.textContent = res.message || res.error || '';
        return;
      }
      if (res.solved) {
        feedback.className = 'pw-feedback good';
        feedback.textContent = 'ACCESS GRANTED';
        return;
      }
      if (res.stageCleared) return stageCleared(res);
      if (res.denied) {
        ctx.sfx('deny');
        vault.classList.remove('pw-denied');
        void vault.offsetWidth;
        vault.classList.add('pw-denied');
        setMood('amused');
        feedback.className = 'pw-feedback bad';
        feedback.textContent = `ACCESS DENIED${res.feedback ? ` - ${res.feedback}` : ''}`;
        say(`Entry "${value.toUpperCase()}" rejected.${res.feedback ? ` ${res.feedback}` : ''}`, 'sys');
        entryInput.value = '';
        paintBoxes();
        if (!res.failed) entryInput.focus();
      }
    }

    async function stageCleared(res) {
      stage = res.stage;
      numeric = res.numeric;
      ctx.sfx('unlock');
      vault.classList.remove('pw-breach');
      void vault.offsetWidth;
      vault.classList.add('pw-breach');
      setMood('alarmed');
      feedback.className = 'pw-feedback good';
      feedback.textContent = `LAYER ${stage} BREACHED`;
      ctx.say(`Layer ${stage} cracked! But the vault has one more lock...`);
      entryInput.value = '';
      setBoxes(res.wordLengths || (res.length ? [res.length] : null));
      renderChips(Number(qChip.textContent.match(/\d+/)?.[0] || 0));
      if (layerChip) entry.querySelector('.pw-entry-layer').textContent = `LAYER ${stage + 1}/${view.stages}`;
      await say(res.reply || res.stageIntro);
      askInput.focus();
    }

    // ----- layout -----
    const vault = h('div', { class: 'pw-vault' },
      h('div', { class: 'pw-head' },
        h('span', { class: 'pw-dots' }, h('i'), h('i'), h('i')),
        h('b', {}, 'SECURE VAULT'), h('span', { class: 'pw-sep' }, '//'), h('span', {}, view.persona),
        h('span', { class: 'grow' }),
        h('span', { class: `pw-chip ${view.aiMode === 'ai' ? 'pw-ai-on' : ''}` }, view.aiMode === 'ai' ? 'AI LINK' : 'OFFLINE ENGINE'),
        layerChip, qChip),
      h('div', { class: 'pw-body' }, ai, log),
      askForm);
    el.append(h('div', { class: 'pw' }, vault, entry));

    setBoxes(lengths);
    renderChips(0);
    if (layerChip) entry.querySelector('.pw-entry-layer').textContent = `LAYER 1/${view.stages}`;
    say('ESTABLISHING SECURE CONNECTION... CONNECTED.', 'sys');
    say(view.intro);
    setTimeout(() => askInput.focus(), 300);

    // Make the eye follow the pointer a little.
    const onMove = (e) => {
      const r = ai.getBoundingClientRect();
      const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 400));
      const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 400));
      pupil.style.transform = `translate(${dx * 12}px, ${dy * 10}px)`;
    };
    document.addEventListener('pointermove', onMove);

    return {
      onKey(e) {
        if (e.key === '/' || e.key === 'Enter') {
          (askInput.disabled ? entryInput : askInput).focus();
          return true;
        }
        if (e.key === 'p' || e.key === 'P') {
          entryInput.focus();
          return true;
        }
        return false;
      },
      async onFinish(outcome) {
        askInput.disabled = true;
        askBtn.disabled = true;
        entryInput.disabled = true;
        unlockBtn.disabled = true;
        if (outcome === 'win') {
          setMood('defeated');
          ctx.sfx('unlock');
          vault.classList.add('pw-open');
          feedback.className = 'pw-feedback good';
          feedback.textContent = 'ACCESS GRANTED';
          await sleep(ctx.reducedMotion ? 200 : 1500);
        } else {
          setMood('amused');
          vault.classList.add('pw-lockdown');
          feedback.className = 'pw-feedback bad';
          feedback.textContent = 'VAULT LOCKED DOWN';
          await sleep(700);
        }
      },
      destroy() {
        destroyed = true;
        document.removeEventListener('pointermove', onMove);
      },
    };
  },

  renderReveal(slot, reveal) {
    if (!reveal.stages?.length) return;
    slot.append(h('div', { class: 'pw-reveal' },
      reveal.stages.map((s, i) => h('div', { class: 'pw-reveal-row' },
        reveal.stages.length > 1 ? h('span', { class: 'pw-reveal-layer' }, `LAYER ${i + 1}`) : null,
        h('span', { class: 'pw-reveal-code' }, s.password),
        reveal.stages.length > 1 && s.explanation ? h('span', { class: 'muted' }, s.explanation) : null))));
  },
};
