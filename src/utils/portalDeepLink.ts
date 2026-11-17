import type { PortalScreen, SubsScope } from "../types";

const SCREENS: readonly PortalScreen[] = ["home", "subs", "manage", "people", "audit", "smoking", "settings"];
const SCOPES: readonly SubsScope[] = ["all", "mine", "needs"];

export interface PortalDeepLink {
  screen?: PortalScreen;
  form?: string;
  item?: string;
  scope?: SubsScope;
}

/**
 * Reads a portal link such as `?screen=subs&form=Permit%20to%20Work&item=42`.
 *
 * Anything it does not recognise is left out rather than guessed at: an unknown
 * screen or scope simply does not appear in the result.
 */
export function readPortalDeepLink(search: string): PortalDeepLink {
  const params = new URLSearchParams(search);
  const link: PortalDeepLink = {};

  const screen = params.get("screen");
  if (screen && (SCREENS as readonly string[]).includes(screen)) link.screen = screen as PortalScreen;

  const form = params.get("form");
  if (form) link.form = form;

  const item = params.get("item");
  if (item) link.item = item;

  const scope = params.get("scope");
  if (scope && (SCOPES as readonly string[]).includes(scope)) link.scope = scope as SubsScope;

  return link;
}
