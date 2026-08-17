import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Composition smoke test for the appearance layer.
 *
 * The failure this catches is not a type error: `AppearanceProvider` renders a
 * ThemeProvider built from a resolved appearance, and a token that resolves to
 * `undefined` — or a `buildTheme` that MUI refuses to construct — compiles
 * perfectly and then throws on mount, taking the entire app down with it,
 * because this provider sits above every route.
 *
 * Rendered to static markup, so no DOM and no signed-in tenant are needed and
 * it runs in the same pass as everything else. Effects do not run under SSR,
 * which is exactly what we want: the SharePoint fetch and the localStorage
 * write both live in effects, so nothing here touches the network.
 */

vi.mock("@azure/msal-react", () => ({
  useMsal: () => ({ instance: {}, accounts: [] }),
}));

const { AppearanceProvider, useAppearance } = await import("./AppearanceContext");

function Probe() {
  const { resolved, setting, loading } = useAppearance();
  return (
    <div
      data-contrast={resolved.contrast.label}
      data-color={resolved.color.label}
      data-font={resolved.font.label}
      data-ink={resolved.ink}
      data-panel={resolved.panel}
      data-background={setting.backgroundId}
      data-loading={String(loading)}
    >
      {resolved.contrast.label}
    </div>
  );
}

describe("AppearanceProvider", () => {
  it("mounts and hands a fully resolved appearance to its children", () => {
    const markup = renderToStaticMarkup(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );

    expect(markup).toContain('data-contrast="Ink on Paper"');
    expect(markup).toContain('data-color="PMW Blue"');
    expect(markup).toContain('data-font="Inter"');
    // The default must resolve to the palette the app shipped with, or every
    // untouched screen has quietly changed colour.
    expect(markup).toContain('data-ink="#101010"');
    expect(markup).toContain('data-panel="#FFFFFF"');
    expect(markup).toContain('data-background="theme"');
  });

  it("throws a useful error when the hook is used outside the provider", () => {
    expect(() => renderToStaticMarkup(<Probe />)).toThrow(/within AppearanceProvider/);
  });
});
