/**
 * The name an approval screen prints under a signature.
 *
 * The record has to say who signed, and the only identity the approval screen
 * is sure of is the account that signed in. Azure usually supplies a display
 * name with the token; when it does not, the address itself is the next best
 * source — `nurul.aisyah@pmw.com.my` is a person's name written in the one
 * place every account has to have one.
 */

const NAME_PARTICLES = new Set([
  "bin", "binti", "bt", "bte", "a/l", "a/p", "al", "de", "del", "der", "van", "von",
]);

function capitalizeWord(word: string): string {
  if (!word) return word;
  const lower = word.toLowerCase();
  if (NAME_PARTICLES.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * `ahmad.faiz@pmw.com` → `Ahmad Faiz`. A local part that is only a login code
 * — `hr01`, `admin` — has no name in it to find, so the address is printed
 * whole rather than dressed up as a name it is not.
 */
export function nameFromEmail(email: string | null | undefined): string {
  const address = (email ?? "").trim();
  if (!address || !address.includes("@")) return address;
  const localPart = address.slice(0, address.indexOf("@"));
  const words = localPart
    // A trailing number is an account disambiguator, not part of a name.
    .replace(/\d+$/, "")
    .replace(/[._-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2) return address;
  return words.map(capitalizeWord).join(" ");
}

/**
 * The signed-in approver's full name: the display name Azure returned, or the
 * name the address spells out, or the address itself.
 */
export function approverDisplayName(
  accountName: string | null | undefined,
  email: string | null | undefined,
): string {
  const name = (accountName ?? "").trim();
  // Some tenants hand back the address as the display name; that is not a name.
  if (name && !name.includes("@")) return name;
  return nameFromEmail(email);
}
