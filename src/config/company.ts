/**
 * The letterhead identity — who the printed document says it is from.
 *
 * A generated PDF leaves the system and is filed, posted, and produced to an
 * auditor, so the top of the page has to carry the same block the company's own
 * stationery carries. None of it is derivable from a form response, so it is
 * configuration rather than data.
 *
 * Only the address is defaulted, and only because it is the one line printed on
 * the reference document this letterhead was modelled on. The registered name,
 * phone, fax and SST number are deliberately blank until someone sets them: a
 * guessed legal identity on a document that gets filed is worse than a gap,
 * because the gap is visibly a gap and the guess is not. Every field below is
 * omitted from the page entirely when unset.
 */

function env(name: keyof ImportMetaEnv, fallback = ""): string {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** Addresses are configured on one line; `|` or a newline starts the next. */
function addressLines(value: string): string[] {
  return value
    .split(/\r?\n|\|/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const DEFAULT_ADDRESS = [
  "Lot 133077, Jalan Lahat,",
  "Bukit Merah Industrial Estate,",
  "31500 Lahat, Perak, Malaysia",
];

export interface CompanyProfile {
  /** Registered name, printed as the first line of the letterhead. */
  name: string;
  addressLines: string[];
  phone: string;
  fax: string;
  sstNo: string;
  /**
   * Full-resolution mark. Not the 128px favicon — the PDF header is measured in
   * points and printed at 300dpi, so a thumbnail that looks fine on screen
   * prints visibly soft.
   */
  logoUrl: string;
}

const configuredAddress = addressLines(env("VITE_COMPANY_ADDRESS"));

export const COMPANY: CompanyProfile = {
  name: env("VITE_COMPANY_NAME"),
  addressLines: configuredAddress.length > 0 ? configuredAddress : DEFAULT_ADDRESS,
  phone: env("VITE_COMPANY_PHONE"),
  fax: env("VITE_COMPANY_FAX"),
  sstNo: env("VITE_COMPANY_SST_NO"),
  logoUrl: env("VITE_COMPANY_LOGO_URL", "/logo.png"),
};

/** The contact lines, already filtered to the ones worth printing. */
export function companyContactLines(profile: CompanyProfile = COMPANY): string[] {
  return [
    profile.phone ? `Phone No: ${profile.phone}` : "",
    profile.fax ? `Fax No: ${profile.fax}` : "",
    profile.sstNo ? `SST No: ${profile.sstNo}` : "",
  ].filter(Boolean);
}
