// The game-show host: curated, classroom-safe lines (never generated live), shown
// as text and optionally spoken with the browser's built-in voice.
import { store } from './store.js';
import { audio } from './audio/engine.js';

const LINES = {
  welcome: ['Welcome to MYSTERYVERSE! Pick a mystery, any mystery.', 'Ready, team? The mysteries are waiting.', 'Lights, camera... mystery!'],
  start: ['Level {level}. Let\'s see what you\'ve got!', 'Here comes level {level}. Put your heads together!', 'Level {level} is live. Talk it out, team!', 'New mystery incoming. Level {level}!'],
  startHard: ['Level {level}, {difficulty} mode. This one might actually stump you.', 'Careful... level {level} is a tricky one.', '{difficulty} difficulty. Only the sharpest detectives survive this one.', 'Level {level}. I\'ve seen grown-ups give up on this one. Just saying.'],
  wrong: ['Interesting guess. Unfortunately, that\'s not it.', 'Nope! But keep those ideas coming.', 'Not quite. Shake it off and try again!', 'Good thinking, wrong answer. Next!', 'So close... actually no, not that close. Try again!'],
  close: ['Ooh, you\'re getting warmer!', 'You\'re on the right track!', 'Close! Tweak that idea a little.', 'Warmer... warmer...'],
  hint: ['Here\'s a little nudge.', 'A hint, coming right up.', 'Okay, okay, here\'s a clue.'],
  solved: ['YES! That\'s it!', 'Brilliant! You cracked it!', 'Nailed it! Ready for something harder?', 'That was impressive!', 'Mystery solved! Take a bow, team.'],
  solvedFast: ['Whoa, that was FAST!', 'Lightning speed! Are you sure you didn\'t peek?', 'Done already? Wow.'],
  solvedNoHint: ['No hints needed. Pure detective skills!', 'Not a single hint! I\'m impressed.'],
  failed: ['This one got away. You\'ll get the next one!', 'The mystery wins this round... but not the next one!', 'Tough one! Let\'s see what it was.'],
  giveup: ['No shame in that one. Here\'s the answer.', 'Let\'s reveal it...'],
  timeLow: ['Ten seconds! Quick, quick!', 'Clock\'s ticking!', 'Time is almost up!'],
  timeUp: ['Time\'s up!', 'Bzzzt! Out of time.'],
  timeUpClassroom: ['Time\'s up, but in Classroom mode you can keep going!'],
  shuffle: ['Next up... let\'s spin the wheel!', 'Where will the Mysteryverse take us next?', 'Shuffle time! Brace yourselves.'],
  team: ['{team}, it\'s your turn!', 'Over to {team}!', '{team}, you\'re up!'],
};

let bubble = null;
let face = null;
let typer = null;

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

export const host = {
  attach(textEl, faceEl) {
    bubble = textEl;
    face = faceEl;
  },
  detach() {
    bubble = null;
    face = null;
  },
  line(kind, vars = {}) {
    const list = LINES[kind] || [kind];
    return fill(list[Math.floor(Math.random() * list.length)], vars);
  },
  /** Show (and optionally speak) a line. `kind` can be a LINES key or literal text. */
  say(kindOrText, vars = {}, { speak = true } = {}) {
    if (!store.settings.host.enabled || !bubble) return;
    const text = LINES[kindOrText] ? this.line(kindOrText, vars) : fill(String(kindOrText), vars);
    clearInterval(typer);
    let i = 0;
    bubble.textContent = '';
    const span = document.createElement('span');
    span.className = 'typing';
    bubble.append(span);
    typer = setInterval(() => {
      i += 2;
      span.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(typer);
        span.className = '';
      }
    }, 18);
    if (face) {
      face.classList.remove('talking');
      void face.offsetWidth;
      face.classList.add('talking');
    }
    if (speak) audio.speak(text);
  },
};
