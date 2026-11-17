import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageCard } from "./MessageCard";
import { LoadingView } from "./LoadingView";
import { Pager } from "./Pager";

/**
 * Markup-level checks for the shared simple-kit pieces. There is no DOM in this
 * test setup, so clicks are not exercised here; what a reader sees and which
 * controls are disabled is.
 */

/** The opening tag of the button with this accessible label. */
function buttonTag(markup: string, label: string): string {
  const match = markup.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`));
  if (!match) throw new Error(`no button labelled ${label}`);
  return match[0];
}

describe("MessageCard", () => {
  it("renders the title as the page heading when it fills the page", () => {
    const markup = renderToStaticMarkup(
      <MessageCard mood="expired" title="This link has expired" body="Ask for a new one." />,
    );

    expect(markup).toContain("<h1");
    expect(markup).toContain("This link has expired");
    expect(markup).toContain("Ask for a new one.");
  });

  it("renders the title as a sub-heading inside a dialog", () => {
    const markup = renderToStaticMarkup(
      <MessageCard fullPage={false} mood="delete" title="Delete this record?" body="It cannot be undone." />,
    );

    expect(markup).not.toContain("<h1");
    expect(markup).toContain("<h2");
  });

  it("puts the role it is given on the card so screen readers announce it", () => {
    const alert = renderToStaticMarkup(<MessageCard mood="error" title="Failed" body="Try again." role="alert" />);
    const status = renderToStaticMarkup(<MessageCard mood="closed" title="Closed" body="Later." role="status" />);
    const plain = renderToStaticMarkup(<MessageCard mood="hello" title="Hi" body="Welcome." />);

    expect(alert).toMatch(/<div[^>]*role="alert"/);
    expect(status).toMatch(/<div[^>]*role="status"/);
    expect(plain).not.toContain("role=");
  });

  it("keeps details hidden until the reader asks for them", () => {
    const markup = renderToStaticMarkup(
      <MessageCard mood="error" title="Something went wrong" body="Try again." details="Error code 502" />,
    );

    expect(markup).toContain("Show details");
    expect(markup).not.toContain("Error code 502");
  });

  it("does not offer a details toggle when there are no details", () => {
    const markup = renderToStaticMarkup(<MessageCard mood="hello" title="Hi" body="Welcome." />);

    expect(markup).not.toContain("Show details");
  });
});

describe("LoadingView", () => {
  it("announces its status politely and shows the default title", () => {
    const markup = renderToStaticMarkup(<LoadingView status="Checking your access" />);

    expect(markup).toContain("Getting things ready");
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Checking your access");
  });

  it("shows the mascot in the loading mood", () => {
    const markup = renderToStaticMarkup(<LoadingView />);

    expect(markup).toContain('aria-hidden="true"');
    expect(markup.match(/<svg/g)).toHaveLength(1);
  });
});

describe("Pager", () => {
  it("shows the row span with en-US thousands separators", () => {
    const markup = renderToStaticMarkup(
      <Pager total={1284} page={50} size={25} onPage={() => {}} onSize={() => {}} />,
    );

    expect(markup).toContain("Showing ");
    expect(markup).toContain("1,226–1,250");
    expect(markup).toContain("1,284");
  });

  it("disables Next on the last page and leaves Previous enabled", () => {
    const markup = renderToStaticMarkup(
      <Pager total={1284} page={52} size={25} onPage={() => {}} onSize={() => {}} />,
    );

    expect(buttonTag(markup, "Next page")).toContain("disabled");
    expect(buttonTag(markup, "Previous page")).not.toContain("disabled");
  });

  it("disables Previous on the first page", () => {
    const markup = renderToStaticMarkup(
      <Pager total={1284} page={1} size={25} onPage={() => {}} onSize={() => {}} />,
    );

    expect(buttonTag(markup, "Previous page")).toContain("disabled");
    expect(buttonTag(markup, "Next page")).not.toContain("disabled");
  });

  it("marks the current page and offers the rows-per-page choices", () => {
    const markup = renderToStaticMarkup(
      <Pager total={100} page={2} size={25} onPage={() => {}} onSize={() => {}} sizes={[25, 50, 100]} />,
    );

    expect(buttonTag(markup, "Page 2")).toContain('aria-current="page"');
    expect(buttonTag(markup, "Page 1")).not.toContain("aria-current");
    expect(markup).toContain("Rows per page");
    expect(markup).toContain('<option value="100">100</option>');
  });

  it("shows gaps as plain text, not as buttons", () => {
    const markup = renderToStaticMarkup(
      <Pager total={1300} page={5} size={25} onPage={() => {}} onSize={() => {}} />,
    );

    expect(markup).toContain("…");
    expect(markup.match(/aria-label="…"/)).toBeNull();
  });
});
