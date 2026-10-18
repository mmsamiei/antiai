// Authorized one-time cleanup of personal PHRASE_HUNT sessions only.
// Dry run: node scripts/cleanup-legacy-phrase-games.cjs
// Backup then delete: node scripts/cleanup-legacy-phrase-games.cjs --delete
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const where = { type: 'PHRASE_HUNT', phraseChallengeId: null };
  const games = await prisma.gameSession.findMany({ where, include: { guesses: true, phraseGuesses: true }, orderBy: { id: 'asc' } });
  console.log(JSON.stringify({ legacyGames: games.length, legacyGuesses: games.reduce((n,g) => n + g.phraseGuesses.length, 0), delete: process.argv.includes('--delete') }));
  if (!process.argv.includes('--delete') || !games.length) return;
  const directory = '/root/anti-ai-games-backups';
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const backup = path.join(directory, 'phrase-hunt-personal-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(backup, JSON.stringify({ backedUpAt: new Date().toISOString(), games }, null, 2), { mode: 0o600, flag: 'wx' });
  const removed = await prisma.$transaction(async tx => {
    const result = await tx.gameSession.deleteMany({ where: { ...where, id: { in: games.map(game => game.id) } } });
    if (result.count !== games.length) throw Error('Legacy records changed; backup retained and deletion rolled back');
    return result.count;
  });
  console.log(JSON.stringify({ backup, deletedGames: removed }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
