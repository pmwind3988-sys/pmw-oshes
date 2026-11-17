import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Mascot, { type MascotMood } from "./Mascot";

const MOODS: MascotMood[] = [
  "hello",
  "loading",
  "success",
  "error",
  "expired",
  "locked",
  "switch",
  "notfound",
  "closed",
  "empty",
  "delete",
];

/**
 * The mascot is decoration beside a message, so screen readers must skip it,
 * and it has to keep the size the caller asks for.
 */
describe("Mascot", () => {
  it.each(MOODS)("renders the %s mood as one hidden svg at the default size", (mood) => {
    const markup = renderToStaticMarkup(<Mascot mood={mood} />);

    expect(markup.match(/<svg/g)).toHaveLength(1);
    expect(markup).toContain('viewBox="0 0 200 200"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('width="120"');
    expect(markup).toContain('height="120"');
  });

  it("uses the size it is given", () => {
    const markup = renderToStaticMarkup(<Mascot mood="hello" size={64} />);

    expect(markup).toContain('width="64"');
    expect(markup).toContain('height="64"');
  });

  it("passes the class name through to the svg", () => {
    const markup = renderToStaticMarkup(<Mascot mood="empty" className="hero-art" />);

    expect(markup).toContain('class="hero-art"');
  });

  it.each(MOODS)("draws the %s scene on a backdrop with one figure", (mood) => {
    const markup = renderToStaticMarkup(<Mascot mood={mood} />);

    expect(markup).toContain('d="M32 104C20 64 52 22 100 20');
    expect(markup.match(/class="memphis-figure"/g)).toHaveLength(1);
  });

  it("draws a different picture for each mood", () => {
    const markups = MOODS.map((mood) => renderToStaticMarkup(<Mascot mood={mood} />));

    expect(new Set(markups).size).toBe(MOODS.length);
  });
});
