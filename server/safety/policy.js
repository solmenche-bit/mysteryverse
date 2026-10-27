// Central content policy: blocklists, topic allowlists and the emoji allowlist.
// Every string that reaches players (curated, generated or AI dialogue) is checked here.
import { getSettings } from '../db.js';

// Profanity is base64-encoded so the raw word list isn't sitting in plain text in a school project.
const PROFANITY = Buffer.from(
  'ZnVjayxmdWNraW5nLGZ1Y2tlcixtb3RoZXJmdWNrZXIsc2hpdCxzaGl0dHksYnVsbHNoaXQsYml0Y2gsYmFzdGFyZCxhc3Nob2xlLGFzcyxkaWNrLGRpY2toZWFkLHBpc3MscGlzc2VkLGN1bnQsc2x1dCx3aG9yZSxmYWcsZmFnZ290LHJldGFyZCxyZXRhcmRlZCxuaWdnZXIsbmlnZ2Esd3RmLHN0ZnUsZGFtbixnb2RkYW1uLGNyYXAscHJpY2ssdHdhdCx3YW5rZXIsYm9sbG9ja3MsZG91Y2hlLGphY2thc3MsZHVtYmFzcyxoZWxs',
  'base64',
).toString('utf8').split(',');

// Always blocked: player input, AI dialogue and generated content.
const HARD = {
  profanity: PROFANITY,
  romance: ['sex', 'sexy', 'sexual', 'porn', 'nude', 'naked', 'kiss', 'kissing', 'dating', 'boyfriend', 'girlfriend',
    'romance', 'romantic', 'flirt', 'flirting', 'lingerie', 'bikini', 'seduce', 'make out', 'hookup', 'hook up', 'valentine', 'valentines'],
  substances: ['beer', 'wine', 'vodka', 'whiskey', 'whisky', 'alcohol', 'alcoholic', 'drunk', 'liquor', 'cocktail', 'booze',
    'cigarette', 'cigarettes', 'cigar', 'smoking', 'vape', 'vaping', 'tobacco', 'marijuana', 'cannabis', 'cocaine', 'heroin',
    'drugs', 'overdose', 'casino', 'gambling', 'gamble', 'poker', 'blackjack', 'roulette', 'lottery', 'betting', 'slot machine'],
  violence: ['kill', 'killed', 'killing', 'murder', 'murdered', 'gun', 'guns', 'rifle', 'pistol', 'shotgun',
    'bomb', 'bombs', 'explosive', 'terrorist', 'terrorism', 'gore', 'gory', 'corpse', 'dead body', 'suicide', 'stab', 'stabbing',
    'massacre', 'torture', 'behead', 'grenade'],
  occult: ['zombie', 'vampire', 'demon', 'demonic', 'devil', 'satan', 'satanic', 'haunted', 'horror', 'witchcraft', 'occult',
    'ouija', 'voodoo', 'exorcism', 'halloween'],
  hate: ['nazi', 'nazis', 'hitler', 'antisemite', 'antisemitic', 'antisemitism', 'kkk'],
};

// Strict Yeshiva Mode additions: applied to everything the site generates or displays.
const STRICT = {
  religion: ['christmas', 'easter', 'church', 'jesus', 'christ', 'santa', 'crucifix', 'mosque', 'buddha', 'hindu', 'idol', 'idols',
    'idolatry', 'pagan'],
  politics: ['trump', 'biden', 'obama', 'democrat', 'democrats', 'republican', 'republicans', 'election', 'elections', 'abortion',
    'liberal', 'conservative', 'maga', 'protest', 'riot', 'hamas', 'isis', 'hezbollah', 'holocaust', 'congress', 'senator'],
  nonkosher: ['pork', 'bacon', 'ham', 'shrimp', 'lobster', 'cheeseburger', 'pepperoni', 'treif', 'treife'],
  entertainment: ['netflix', 'youtube', 'tiktok', 'instagram', 'disney', 'marvel', 'superhero', 'fortnite', 'minecraft', 'pokemon',
    'star wars', 'harry potter', 'hollywood', 'celebrity', 'rapper', 'nightclub', 'concert'],
  crude: ['toilet', 'underwear', 'fart', 'farting', 'poop', 'vomit', 'puke', 'butt', 'boobs', 'diaper'],
  scary: ['ghost', 'ghosts', 'witch', 'witches', 'skull', 'skeleton', 'blood', 'bloody', 'monster', 'monsters', 'creepy', 'nightmare',
    'weapon', 'weapons', 'sword', 'war', 'shooting', 'bullet', 'bullets'],
};

const compile = (terms) =>
  terms.length
    ? new RegExp(`\\b(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|')})\\b`, 'i')
    : null;

const HARD_RE = Object.fromEntries(Object.entries(HARD).map(([k, v]) => [k, compile(v)]));
const STRICT_RE = Object.fromEntries(Object.entries(STRICT).map(([k, v]) => [k, compile(v)]));

// Undo common evasions (l33t, spacing tricks) before matching.
function prep(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[@4]/g, 'a')
    .replace(/[$5]/g, 's')
    .replace(/0/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/7/g, 't')
    .replace(/[*_.\-]+(?=\w)/g, '');
}

/**
 * Scan text against the policy.
 * @param {string} text
 * @param {{strict?: boolean}} [opts] strict defaults to the admin setting (on unless turned off)
 * @returns {{ok: boolean, hits: Array<{category: string, term: string}>}}
 */
export function scanText(text, opts = {}) {
  const settings = getSettings().content;
  const strict = opts.strict ?? settings.strictMode;
  const raw = String(text ?? '');
  const variants = [raw.toLowerCase(), prep(raw)];
  const hits = [];
  const check = (table) => {
    for (const [category, re] of Object.entries(table)) {
      for (const v of variants) {
        const m = re && v.match(re);
        if (m) {
          hits.push({ category, term: m[1] });
          break;
        }
      }
    }
  };
  check(HARD_RE);
  if (strict) check(STRICT_RE);
  const extra = compile((settings.extraBlockedTerms || []).filter(Boolean));
  if (extra) for (const v of variants) {
    const m = v.match(extra);
    if (m) {
      hits.push({ category: 'admin', term: m[1] });
      break;
    }
  }
  return { ok: hits.length === 0, hits };
}

/** Player-typed text uses only the hard list, so innocent words like "war" in "warm" or "ham" never trip it. */
export function scanPlayerText(text) {
  return scanText(text, { strict: false });
}

/** Collect every string inside a value (for scanning whole challenge objects). */
export function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

export function scanObject(value, opts) {
  const hits = [];
  for (const s of collectStrings(value)) {
    const r = scanText(s, opts);
    if (!r.ok) hits.push(...r.hits.map((h) => ({ ...h, text: s.slice(0, 120) })));
  }
  return { ok: hits.length === 0, hits };
}

// Emoji that generated content may use as pictures. Anything else is rejected,
// which keeps alcohol, weapons, scary, immodest and other-religion imagery out.
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const graphemes = (s) =>
  [...segmenter.segment(String(s ?? '').replace(/️/g, ''))].map((g) => g.segment).filter((g) => !/\s/.test(g));

export const SAFE_EMOJI = new Set(
  graphemes(`🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🐤🦆🦅🦉🐴🦄🐝🐛🦋🐌🐞🐜🦗🐢🦎🐍🐙🦑🦀🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🦍🐘🦛🦏🐪🐫🦒🦘🐃🐂🐄🐎🐖🐏🐑🦙🐐🦌🐕🐩🐈🐓🦃🦚🦜🦢🦩🕊🐇🦝🦨🦡🦦🦥🐁🐀🐿🦔🐾🐉🦕🦖
🌵🎄🌲🌳🌴🌱🌿☘🍀🎍🎋🍃🍂🍁🍄🐚🌾💐🌷🌹🥀🌺🌸🌼🌻🌞🌝🌛🌜🌚🌕🌖🌗🌘🌑🌒🌓🌔🌙🌎🌍🌏🪐💫⭐🌟✨⚡☄💥🔥🌪🌈☀🌤⛅🌥☁🌦🌧⛈🌩🌨❄☃⛄🌬💨💧💦☔☂🌊🌫
🍏🍎🍐🍊🍋🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶🫑🌽🥕🧄🧅🥔🍠🥐🥯🍞🥖🥨🧀🥚🍳🧈🥞🧇🍗🍖🌭🍔🍟🍕🫓🥪🥙🧆🌮🌯🥗🥘🫕🥫🍝🍜🍲🍛🍣🍱🥟🍤🍙🍚🍘🍥🥠🥮🍢🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🌰🥜🍯🥛🍼☕🍵🧃🥤🧋🧊🥢🍽🍴🥄🧂
⚽🏀🏈⚾🥎🎾🏐🏉🥏🎱🪀🏓🏸🏒🏑🥍🏏🪃🥅⛳🪁🏹🎣🤿🥊🥋🎽🛹🛼🛷⛸🥌🎿⛷🏂🪂🏋🤸⛹🤾🏌🏇🧘🏄🏊🤽🚣🧗🚵🚴🏆🥇🥈🥉🏅🎖🏵🎗🎫🎟🎪🤹🎨🎬🎤🎧🎼🎹🥁🪘🎷🎺🪗🎸🪕🎻🎳🎮🧩♟🎯🎲
🚗🚕🚙🚌🚎🏎🚓🚑🚒🚐🛻🚚🚛🚜🦯🦽🦼🛴🚲🛵🏍🛺🚨🚔🚍🚘🚖🚡🚠🚟🚃🚋🚞🚝🚄🚅🚈🚂🚆🚇🚊🚉✈🛫🛬🛩💺🛰🚀🛸🚁🛶⛵🚤🛥🛳⛴🚢⚓🪝⛽🚧🚦🚥🚏🗺🗿🗽🗼🏰🏯🏟🎡🎢🎠⛲⛱🏖🏝🏜🌋⛰🏔🗻🏕⛺🛖🏠🏡🏘🏚🏗🏭🏢🏬🏣🏤🏥🏦🏨🏪🏫🏩🏛🕍🕋⛩🛤🛣🗾🎑🏞🌅🌄🌠🎇🎆🌇🌆🏙🌃🌌🌉🌁
⌚📱📲💻⌨🖥🖨🖱🖲🕹🗜💽💾💿📀📼📷📸📹🎥📽🎞📞☎📟📠📺📻🎙🎚🎛🧭⏱⏲⏰🕰⌛⏳📡🔋🔌💡🔦🕯🪔🧯🛢💸💵💴💶💷🪙💰💳💎⚖🪜🧰🪛🔧🔨⚒🛠⛏🪚🔩⚙🪤🧱⛓🧲🧨🪓🔪🛡🚬⚰🪦⚱🏺🔮📿🧿💈⚗🔭🔬🕳🩹🩺💊💉🩸🧬🦠🧫🧪🌡🧹🪠🧺🧻🚽🚰🚿🛁🛀🧼🪥🪒🧽🪣🧴🛎🔑🗝🚪🪑🛋🛏🛌🧸🪆🖼🪞🪟🛍🛒🎁🎈🎏🎀🪄🪅🎊🎉🎎🏮🎐🧧✉📩📨📧💌📥📤📦🏷🪧📪📫📬📭📮📯📜📃📄📑🧾📊📈📉🗒🗓📆📅🗑📇🗃🗳🗄📋📁📂🗂🗞📰📓📔📒📕📗📘📙📚📖🔖🧷🔗📎🖇📐📏🧮📌📍✂🖊🖋✒🖌🖍📝✏🔍🔎🔏🔐🔒🔓
🧢👒🎩🎓⛑👓🕶🥽🧣🧤🧥🧦👔👕👖🥼🦺👗👘🥻🩳👚👛👜👝🎒🩴👞👟🥾🥿👠👡🩰👢👑💍🌂🧳
❤🧡💛💚💙💜🤎🖤🤍💯✅☑✔❌❎➕➖➗✖♾💲❓❔❕❗〰©®™🔟🔢🔤🔡🔠🆗🆕🆓0️⃣1️⃣2️⃣3️⃣🔴🟠🟡🟢🔵🟣🟤⚫⚪🟥🟧🟨🟩🟦🟪🟫⬛⬜◼◻◾◽▪▫🔶🔷🔸🔹🔺🔻💠🔘🔳🔲🏁🚩🇮🇱✡🕎🔯🪔⭕🛑⛔📛🚫💢♨🚸🔅🔆⚠🚷🔱⚜🔰♻🌐💤🎵🎶🔔🔕📣📢💬💭🗯🤐🧑‍⚖️🦷👀🗣🤧👤🤫🐥🐣🌀🫒🪡🏃🕛🕐🕑🕒🕓🕔🕕🕖🕗🕘🕙🕚`),
);

// A few of the above are kept out of generated content even though they are ordinary
// in other settings (weapons, tools-as-weapons, medicine, grave items, other-religion symbols).
for (const e of graphemes('🔪🪓🧨🛡🚬⚰🪦⚱🔮🧿💊💉🩸🪄🚽🪠⛩🕋🎄🐷🐖🐗🦇🦂🕷🕸🎲')) SAFE_EMOJI.delete(e);

/** True if every grapheme in `emoji` is on the allowlist (variation selectors ignored). */
export function isSafeEmoji(emoji) {
  const list = graphemes(emoji);
  return list.length > 0 && list.every((g) => SAFE_EMOJI.has(g));
}

export const SAFE_EMOJI_LIST = () => [...SAFE_EMOJI].join('');
