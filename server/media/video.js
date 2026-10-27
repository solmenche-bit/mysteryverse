// Video provider abstraction for "What Happens Next?".
//
//   canvas      Built-in original animated clips, rendered live in the browser
//               (public/js/games/nextup-clips.js). Connected and working.
//   file        An uploaded (Admin > Media) or linked MP4/WEBM file plus a pause
//               timestamp, played with an HTML5 <video>. Connected and working.
//   generative  Text-to-video generation. NOT connected: no provider is configured,
//               and generate() refuses rather than pretending. Wire a real service in
//               here (and pre-generate in the background; never during a live round).
import { CANVAS_CLIPS } from '../content/nextup.js';

export const VIDEO_PROVIDERS = [
  { id: 'canvas', label: 'Built-in animated clips (original, rendered in the browser)', connected: true },
  { id: 'file', label: 'Uploaded or linked video file (MP4/WEBM) with a pause timestamp', connected: true },
  { id: 'generative', label: 'Text-to-video generation', connected: false, note: 'No text-to-video provider is connected.' },
];

export const generativeVideoProvider = {
  id: 'generative',
  connected: false,
  /** @param {{prompt: string, seconds: number}} _request */
  async generate(_request) {
    throw new Error('No text-to-video provider is connected. Upload a clip in Admin > Media and reference it with clip.kind = "file".');
  },
};

const FILE_URL = /^(\/uploads\/[\w-]+\.(mp4|webm)|https:\/\/[^\s"'<>]+\.(mp4|webm)(\?[^\s"'<>]*)?)$/i;

/** Public clip descriptor for the browser (never includes the outcome). */
export function resolveClip(d) {
  const c = d?.clip || {};
  if (c.kind === 'file') return { kind: 'file', url: c.url, pauseAt: Number(c.pauseAt), duration: c.duration ? Number(c.duration) : null };
  const meta = CANVAS_CLIPS[c.clipId] || {};
  return { kind: 'canvas', clipId: c.clipId, pauseAt: meta.pauseAt, duration: meta.duration };
}

export function validateClip(d) {
  const problems = [];
  const c = d?.clip;
  if (!c || typeof c !== 'object') return ['clip is required: { kind: "canvas", clipId } or { kind: "file", url, pauseAt }'];
  if (c.kind === 'canvas') {
    if (!CANVAS_CLIPS[c.clipId]) problems.push(`Unknown built-in clip "${c.clipId}". Available: ${Object.keys(CANVAS_CLIPS).join(', ')}`);
  } else if (c.kind === 'file') {
    if (!FILE_URL.test(String(c.url || ''))) problems.push('clip.url must be an uploaded /uploads/<file>.mp4|webm or an https:// link to an .mp4/.webm file');
    const p = Number(c.pauseAt);
    if (!(p > 0)) problems.push('clip.pauseAt (seconds) must be greater than 0');
    if (c.duration != null && !(Number(c.duration) > p)) problems.push('clip.duration must be longer than clip.pauseAt');
  } else if (c.kind === 'generative') {
    problems.push('Generated video clips are not available: no text-to-video provider is connected');
  } else problems.push('clip.kind must be "canvas" or "file"');
  return problems;
}
