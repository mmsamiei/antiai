export type PublicProfileGameType = "IRAN_CITY" | "COUNTRY";

export type GeographyProfileStats = {
  total: number;
  wins: number;
  surrendered: number;
  averageGuesses: number | null;
  bestGame: number | null;
};

export type PublicProfileStats = {
  geography: Record<PublicProfileGameType, GeographyProfileStats>;
  semantris: { games: number; totalScore: number; bestScore: number | null };
  letterDuel: {
    rounds: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number | null;
  };
  phraseHunt: { games: number; wins: number; surrendered: number; bestScore: number | null };
};

export function buildPublicProfileStats(
  geographyGroups: {
    type: string;
    status: string;
    count: number;
    averageGuesses: number | null;
    bestGame: number | null;
  }[],
  semantrisScores: number[],
  duelGroups: { status: string; count: number }[],
  phraseHuntGames: { status: string; bestScore: number }[] = [],
): PublicProfileStats {
  const geography: Record<PublicProfileGameType, GeographyProfileStats> = {
    IRAN_CITY: {
      total: 0,
      wins: 0,
      surrendered: 0,
      averageGuesses: null,
      bestGame: null,
    },
    COUNTRY: {
      total: 0,
      wins: 0,
      surrendered: 0,
      averageGuesses: null,
      bestGame: null,
    },
  };

  for (const group of geographyGroups) {
    if (group.type !== "IRAN_CITY" && group.type !== "COUNTRY") continue;
    const stats = geography[group.type];
    stats.total += group.count;
    if (group.status === "WON") {
      stats.wins += group.count;
      stats.averageGuesses = group.averageGuesses;
      stats.bestGame = group.bestGame;
    } else if (group.status === "SURRENDERED") {
      stats.surrendered += group.count;
    }
  }

  const duel = { rounds: 0, wins: 0, losses: 0, draws: 0, winRate: null as number | null };
  for (const group of duelGroups) {
    duel.rounds += group.count;
    if (group.status === "WON") duel.wins += group.count;
    else if (group.status === "LOST") duel.losses += group.count;
    else if (group.status === "DRAW") duel.draws += group.count;
  }
  if (duel.rounds > 0) duel.winRate = duel.wins / duel.rounds;

  return {
    geography,
    semantris: {
      games: semantrisScores.length,
      totalScore: semantrisScores.reduce((sum, score) => sum + Math.max(0, score), 0),
      bestScore: semantrisScores.length
        ? Math.max(...semantrisScores.map((score) => Math.max(0, score)))
        : null,
    },
    letterDuel: duel,
    phraseHunt: {
      games: phraseHuntGames.length,
      wins: phraseHuntGames.filter((game) => game.status === "WON").length,
      surrendered: phraseHuntGames.filter((game) => game.status === "SURRENDERED").length,
      bestScore: phraseHuntGames.length ? Math.max(...phraseHuntGames.map((game) => game.bestScore)) : null,
    },
  };
}
