import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSubjects, getSubject, interpret, newReverseState, reverseNext, reverseAnswer, valueOf } from '../server/engine/kb.js';
import { SUBJECTS } from '../server/content/subjects.js';

registerSubjects(SUBJECTS);
const ask = (id, q) => {
  const r = interpret(getSubject(id), q);
  return r.kind === 'answer' ? r.value : r.kind === 'guess' ? (r.correct ? 'CORRECT' : 'WRONG') : r.kind;
};

test('every subject is complete', () => {
  for (const s of SUBJECTS) {
    assert.equal(s.hints?.length, 3, `${s.id} needs 3 hints`);
    assert.ok(s.emoji, `${s.id} emoji`);
  }
});

test('common questions get the right answers', () => {
  const cases = [
    ['bicycle', 'Is it alive?', 'no'], ['bicycle', 'Does it have wheels?', 'yes'], ['bicycle', 'Does it have an engine?', 'no'],
    ['bicycle', 'Can you find it outside?', 'yes'], ['bicycle', 'is it a bike', 'CORRECT'], ['bicycle', 'Is it a car?', 'WRONG'],
    ['dog', 'Is it an animal?', 'yes'], ['dog', 'Does it have four legs?', 'yes'], ['dog', 'Is it bigger than a car?', 'no'],
    ['dog', 'Is it bigger than a shoebox?', 'yes'], ['dog', 'Can it fly?', 'no'], ['dog', 'Is it a mammal?', 'yes'],
    ['penguin', 'Can it fly?', 'no'], ['penguin', 'Is it a bird?', 'yes'], ['penguin', 'Is it black?', 'yes'],
    ['apple', 'Can you eat it?', 'yes'], ['apple', 'Does it grow on a tree?', 'yes'], ['apple', 'Is it red?', 'yes'], ['apple', 'Is it alive?', 'no'],
    ['apple', 'Is it used on Rosh Hashana?', 'yes'], ['apple', 'Is it electronic?', 'no'], ['apple', "Isn't it a fruit?", 'no'],
    ['phone', 'Does it have a screen?', 'yes'], ['phone', 'Can you hold it in your hand?', 'yes'], ['phone', 'Is it made of wood?', 'no'],
    ['menorah', 'Is it used on Chanukah?', 'yes'], ['menorah', 'Is it used on Pesach?', 'no'], ['menorah', 'Is it Jewish?', 'yes'],
    ['shadow', 'Can you touch it?', 'no'], ['shadow', 'Is it alive?', 'no'], ['echo', 'Does it make a sound?', 'yes'],
    ['cactus', 'Is it found in the desert?', 'yes'], ['turtle', 'Is it fast?', 'no'], ['kotel', 'Is it in Israel?', 'yes'],
    ['sun', 'Is it hot?', 'yes'], ['sun', 'Is it in the sky?', 'yes'], ['car', 'Is it smaller than a person?', 'no'],
    ['keys', 'Does it fit in a pocket?', 'yes'], ['keys', 'Is it made of metal?', 'yes'], ['library', 'Is it quiet?', 'yes'],
    ['pizza', 'Is it hot?', 'yes'], ['pizza', 'Is it dairy?', 'yes'], ['guitar', 'Does it have strings?', 'yes'],
    ['airplane', 'Does it have wings?', 'yes'], ['umbrella', 'Is it used in the rain?', 'yes'], ['icecream', 'Is it cold?', 'yes'],
  ];
  const bad = cases.map(([id, q, want]) => [id, q, want, ask(id, q)]).filter((c) => c[2] !== c[3]);
  assert.deepEqual(bad, []);
});

test('non yes/no and unclear questions are recognized', () => {
  assert.equal(ask('dog', 'What color is it?'), 'notyesno');
  assert.equal(ask('dog', 'blorp zing'), 'unclear');
});

test('reverse mode usually finds a known subject within 20 questions', () => {
  let found = 0;
  const targets = ['dog', 'bicycle', 'apple', 'menorah', 'phone', 'penguin', 'sun', 'pizza', 'guitar', 'umbrella'];
  for (const target of targets) {
    const subj = getSubject(target);
    const st = newReverseState();
    for (let i = 0; i < 20; i++) {
      const n = reverseNext(st, 20 - i);
      if (n.type === 'guess') {
        if (n.subjectId === target) {
          found++;
          break;
        }
        st.rejected.push(n.subjectId);
        continue;
      }
      if (n.type !== 'question') break;
      const v = n.qid.startsWith('size>') ? (subj.size > Number(n.qid.slice(5)) ? 'yes' : 'no') : valueOf(subj, n.qid);
      reverseAnswer(st, n.qid, v === 'yes' || v === 'no' ? v : 'sometimes');
    }
  }
  assert.ok(found >= 8, `found ${found}/${targets.length}`);
});
