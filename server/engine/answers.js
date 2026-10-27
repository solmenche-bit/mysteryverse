// Answer checking: normalization, synonyms, typo tolerance, then (optionally) AI semantic judging.
import { aiAvailable, aiJSON } from '../ai/provider.js';
import { CONTENT_POLICY, INJECTION_GUARD, playerText, objectSchema, oneOf, str } from '../ai/prompts.js';

const SYNONYM_GROUPS = [
  ['phone', 'telephone', 'cellphone', 'cell phone', 'smartphone', 'mobile phone'],
  ['tv', 'television', 'telly'],
  ['car', 'automobile'],
  ['bicycle', 'bike', 'pushbike'],
  ['airplane', 'plane', 'aeroplane', 'aircraft', 'jet plane'],
  ['keyboard', 'computer keyboard', 'typing', 'someone typing', 'keyboard typing'],
  ['sofa', 'couch'],
  ['trash can', 'garbage can', 'trashcan', 'garbage bin', 'rubbish bin', 'wastebasket'],
  ['refrigerator', 'fridge'],
  ['shul', 'synagogue'],
  ['shabbos', 'shabbat', 'sabbath'],
  ['pesach', 'passover'],
  ['sukkos', 'sukkot', 'succos', 'sukkoth'],
  ['chanukah', 'hanukkah', 'chanuka', 'hanukah', 'channukah', 'hanuka'],
  ['purim', 'poorim'],
  ['jerusalem', 'yerushalayim'],
  ['kotel', 'western wall', 'wailing wall'],
  ['matzah', 'matza', 'matzo', 'matzoh'],
  ['challah', 'chala', 'challa', 'chalah'],
  ['menorah', 'chanukiah', 'chanukia', 'hanukkiah'],
  ['tzedakah', 'tzedaka', 'charity'],
  ['yarmulke', 'kippah', 'kipa', 'kippa', 'yarmulka', 'kipah'],
  ['siddur', 'prayer book'],
  ['dreidel', 'dreidle', 'sevivon'],
  ['gragger', 'grogger', 'groger', 'noisemaker', 'noise maker', 'ratchet'],
  ['shofar', 'rams horn'],
  ['esrog', 'etrog'],
  ['sukkah', 'succah', 'sukka', 'succa'],
  ['hourglass', 'sand timer', 'sandglass', 'egg timer'],
  ['backpack', 'knapsack', 'schoolbag', 'school bag', 'book bag', 'bookbag', 'rucksack'],
  ['eraser', 'rubber eraser'],
  ['flashlight', 'torch light', 'electric torch'],
  ['cookie', 'biscuit'],
  ['candy', 'sweets'],
  ['ping pong', 'table tennis'],
  ['photo', 'photograph', 'picture'],
  ['laptop', 'notebook computer'],
  ['computer', 'pc'],
  ['lightbulb', 'light bulb', 'bulb'],
  ['popsicle', 'ice pop', 'ice lolly'],
  ['sweater', 'jumper'],
  ['elevator', 'lift'],
  ['faucet', 'tap'],
  ['soda', 'soft drink', 'pop'],
  ['kid', 'child'],
  ['ocean', 'sea'],
  ['rabbit', 'bunny'],
  ['puppy', 'dog'],
  ['kitten', 'cat'],
  ['clock', 'alarm clock', 'ticking clock'],
  ['sneaker', 'trainer', 'running shoe'],
  ['microwave', 'microwave oven'],
  ['rain', 'rainfall', 'raining'],
  ['thunder', 'thunderstorm', 'thunder storm'],
  ['zip', 'zipper'],
  ['ball bouncing', 'bouncing ball', 'basketball bouncing', 'ball bounce'],
  ['mailbox', 'postbox', 'letterbox'],
  ['garbage truck', 'trash truck', 'dump truck'],
  ['doorbell', 'door bell'],
  ['black and white', 'black white', 'white and black'],
];

export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(['a', 'an', 'the', 'of', 'to', 'is', 'it', 'its', 'are', 'they', 'theyre', 'all', 'some', 'them',
  'thing', 'things', 'that', 'this', 'these', 'those', 'with', 'for', 'in', 'on', 'and', 'or', 'be', 'something',
  'stuff', 'kind', 'type', 'sort', 'my', 'answer', 'guess', 'i', 'think', 'maybe', 'probably', 'have', 'has', 'can', 'you']);

function stem(w) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(ches|shes|xes|sses|zes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

// Phrase -> canonical head, longest phrases first so "cell phone" beats "phone".
const SYN_LIST = SYNONYM_GROUPS.flatMap((g) => g.map((p) => [normalize(p), normalize(g[0])])).sort((a, b) => b[0].length - a[0].length);

function applySynonyms(norm) {
  let s = ` ${norm} `;
  for (const [phrase, head] of SYN_LIST) {
    if (s.includes(` ${phrase} `)) s = s.split(` ${phrase} `).join(` ${head.replace(/ /g, '_')} `);
  }
  return s.trim().replace(/_/g, ' ');
}

export function tokens(s) {
  return applySynonyms(normalize(s))
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .map(stem);
}

export const canonical = (s) => tokens(s).join(' ');

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function similarity(a, b) {
  if (!a && !b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// Short words must be exact ("cat" is not "car"); longer words tolerate typos.
const typoOk = (a, b) => {
  const len = Math.max(a.length, b.length);
  if (len <= 4) return a === b;
  if (len <= 7) return levenshtein(a, b) <= 1;
  return levenshtein(a, b) <= 2;
};

/**
 * Local (deterministic) answer matching.
 * @returns {{match: boolean, close: boolean, type: string, target: string|null}}
 */
export function matchAnswer(guess, accepted) {
  const g = canonical(guess);
  const gRaw = normalize(guess);
  if (!g) return { match: false, close: false, type: 'empty', target: null };
  const gt = g.split(' ');
  const shotgun = /\bor\b|,|\//.test(String(guess)) || /\bor\b/.test(gRaw);
  let close = false;
  for (const a of accepted.filter(Boolean)) {
    const t = canonical(a);
    if (!t) continue;
    if (g === t || g.replace(/ /g, '') === t.replace(/ /g, '')) return { match: true, close: true, type: 'exact', target: a };
    if (typoOk(g.replace(/ /g, ''), t.replace(/ /g, ''))) return { match: true, close: true, type: 'typo', target: a };
    const tt = t.split(' ');
    const covered = tt.filter((w) => gt.some((x) => x === w || (w.length > 4 && typoOk(x, w))));
    if (!shotgun && covered.length === tt.length && gt.length <= tt.length + 2) {
      return { match: true, close: true, type: 'contains', target: a };
    }
    if (covered.length && covered.length / tt.length >= 0.5) close = true;
  }
  return { match: false, close, type: 'none', target: null };
}

const JUDGE_SCHEMA = objectSchema({
  verdict: oneOf(['correct', 'close', 'wrong']),
  reason: str('one short, friendly sentence for the players (never reveal the answer when not correct)'),
});

const judgeCache = new Map();

/**
 * Full answer check. Local matching first; if that fails and AI is available,
 * a semantic judge decides whether different wording means the same thing.
 * @param {string} guess
 * @param {{answer: string, accepted?: string[], context?: string, cacheKey?: string, semantic?: boolean}} o
 * @returns {Promise<{correct: boolean, close: boolean, method: string, reason?: string}>}
 */
export async function checkAnswer(guess, { answer, accepted = [], context = '', cacheKey = '', semantic = true }) {
  const local = matchAnswer(guess, [answer, ...accepted]);
  if (local.match) return { correct: true, close: true, method: local.type };
  const canon = canonical(guess);
  if (!semantic || !aiAvailable() || canon.length < 2 || canon.length > 120) {
    return { correct: false, close: local.close, method: 'local' };
  }
  const key = `${cacheKey}|${canon}`;
  if (judgeCache.has(key)) return judgeCache.get(key);
  try {
    const out = await aiJSON({
      purpose: 'answers.judge',
      system: `You judge answers in a party guessing game for a classroom. Be fair: accept different wording,
synonyms, and equivalent descriptions of the same answer. Reject answers that are vaguer or about something different
(mark those "close" if they are on the right track). Do not change the intended answer.
${INJECTION_GUARD}
${CONTENT_POLICY}`,
      messages: [{
        role: 'user',
        content: `Intended answer: ${answer}\nAlso accepted: ${accepted.join('; ') || '(none)'}\nPuzzle context: ${context || '(none)'}\nPlayer guess: ${playerText(guess)}`,
      }],
      schema: JUDGE_SCHEMA,
      effort: 'low',
      maxTokens: 1500,
      timeoutMs: 20_000,
    });
    const correct = out.verdict === 'correct';
    // A "not quite" explanation must never give the answer away.
    const leaks = !correct && [answer, ...accepted].some((a) => canonical(a) && ` ${canonical(out.reason)} `.includes(` ${canonical(a)} `));
    const result = { correct, close: out.verdict !== 'wrong', method: 'ai', reason: leaks ? '' : out.reason };
    judgeCache.set(key, result);
    if (judgeCache.size > 5000) judgeCache.delete(judgeCache.keys().next().value);
    return result;
  } catch {
    return { correct: false, close: local.close, method: 'local' };
  }
}
