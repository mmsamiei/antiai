/** Inverted index: letter -> IDs in the shared word array, never copied word text. */
export class LetterWordIndex {
  private readonly words: string[] = [];
  private readonly letters = new Map<string, Set<number>>();

  constructor(words: Iterable<string>) {
    for (const word of words) {
      if (word.length < 3 || word.length > 32 || !/^[\u0600-\u06ff]+$/u.test(word)) continue;
      const id = this.words.push(word) - 1;
      for (const letter of new Set(word)) {
        let ids = this.letters.get(letter);
        if (!ids) this.letters.set(letter, ids = new Set());
        ids.add(id);
      }
    }
  }

  find(first: string, second: string): string | null {
    const a = this.letters.get(first), b = this.letters.get(second);
    if (!a || !b) return null;
    const [smaller, other] = a.size <= b.size ? [a, b] : [b, a];
    for (const id of smaller) {
      if (!other.has(id)) continue;
      const word = this.words[id];
      if (first !== second || word.indexOf(first, word.indexOf(first) + 1) !== -1) return word;
    }
    return null;
  }
}
