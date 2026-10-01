import embeddings from "../../scripts/data/adjectives-embeddings.json";

export type AdjectiveItem = {
  id: string;
  name: string;
  aliases: string[];
  embedding: number[];
};

if (embeddings.adjectives.length !== embeddings.vectors.length) {
  throw new Error("Adjective dataset has mismatched words and vectors");
}

export const adjectives: AdjectiveItem[] = embeddings.adjectives.map((name, index) => ({
  id: `adjective-${index + 1}`,
  name,
  aliases: [name],
  embedding: embeddings.vectors[index]
}));
