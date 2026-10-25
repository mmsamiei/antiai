/** Public visual label only; never used as an authentication secret. */
export function codeLoginReference(id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("Invalid login request reference");
  return id.slice(0, 12).toUpperCase().match(/.{4}/g)!.join("-");
}
