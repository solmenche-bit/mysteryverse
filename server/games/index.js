// Game registry. Order here is the order of the cards on the home page.
import connection from './connection.js';
import password from './password.js';
import mysterybox from './mysterybox.js';
import nextup from './nextup.js';
import fake from './fake.js';
import sound from './sound.js';
import twenty from './twenty.js';

export const GAMES = [connection, password, mysterybox, nextup, fake, sound, twenty];
export const GAME_MAP = Object.fromEntries(GAMES.map((g) => [g.id, g]));
