// Lazy loaders for the client side of each game.
const LOADERS = {
  connection: () => import('./connection.js'),
  password: () => import('./password.js'),
  mysterybox: () => import('./mysterybox.js'),
  nextup: () => import('./nextup.js'),
  fake: () => import('./fake.js'),
  sound: () => import('./sound.js'),
  twenty: () => import('./twenty.js'),
};

export async function loadGame(id) {
  const loader = LOADERS[id];
  if (!loader) throw new Error(`Unknown game "${id}"`);
  return (await loader()).default;
}
