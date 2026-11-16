import type { ReactNode } from "react";

export type MascotMood =
  | "hello"
  | "loading"
  | "success"
  | "error"
  | "expired"
  | "locked"
  | "switch"
  | "notfound"
  | "closed"
  | "empty"
  | "delete";

/*
 * The mascot is a clipboard character. These are illustration colours, fixed
 * on purpose: the picture reads the same in every contrast theme.
 */
const INK = "#1B2540";
const SUN = "#FFC83D";
const WHITE = "#FFFFFF";
const BLUSH = "#FFB3A7";
const LINE = "#C9D3E6";

interface MoodArt {
  backdrop: string;
  /** Eyes and mouth. */
  face: ReactNode;
  /** Optional extra marks (sparkles, sweat, a question mark, zzz). */
  extra?: ReactNode;
  /** Clipboard outline is dashed when the list is empty. */
  dashed?: boolean;
  badgeFill: string;
  badge: ReactNode;
}

const dot = (cx: number, cy: number, r = 3.2) => (
  <circle cx={cx} cy={cy} r={r} fill={INK} />
);

const MOOD_ART: Record<MascotMood, MoodArt> = {
  hello: {
    backdrop: "#E3EEFF",
    face: (
      <>
        {dot(51, 56)}
        {dot(69, 56)}
        <path d="M52 64q8 8 16 0" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
      </>
    ),
    badgeFill: "#1F5FD0",
    badge: (
      <path
        d="M81 90h13M89 84l6 6-6 6"
        fill="none"
        stroke={WHITE}
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  loading: {
    backdrop: "#FFF1CC",
    face: (
      <>
        <path d="M47 56q4 4 8 0M65 56q4 4 8 0" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
        <path d="M56 66h8" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
      </>
    ),
    badgeFill: SUN,
    badge: (
      <path
        d="M84 81h12M84 99h12M85 81c0 7 10 10 10 18M95 81c0 7-10 10-10 18"
        fill="none"
        stroke={INK}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  success: {
    backdrop: "#DDF5E6",
    extra: (
      <path d="M14 30l4 8M104 22l-5 7M20 100l6-4" fill="none" stroke="#17794B" strokeWidth={3.5} strokeLinecap="round" />
    ),
    face: (
      <>
        <path d="M47 57q4-5 8 0M65 57q4-5 8 0" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
        <path d="M51 63q9 11 18 0z" fill={INK} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      </>
    ),
    badgeFill: "#17794B",
    badge: (
      <path
        d="M82 90l6 6 11-12"
        fill="none"
        stroke={WHITE}
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  error: {
    backdrop: "#FFE4E0",
    face: (
      <>
        <path d="M48 53l6 6M54 53l-6 6M66 53l6 6M72 53l-6 6" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
        <path d="M52 69q8-7 16 0" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
      </>
    ),
    badgeFill: "#C8372D",
    badge: <path d="M90 81v10M90 98v.5" fill="none" stroke={WHITE} strokeWidth={4} strokeLinecap="round" />,
  },
  expired: {
    backdrop: "#FFF1CC",
    extra: (
      <path d="M82 30q4-6 8 0M96 40q3-5 6 0" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
    ),
    face: (
      <>
        <path d="M47 56h8M65 56h8" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
        <path d="M54 67q6-4 12 0" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
      </>
    ),
    badgeFill: "#B4530B",
    badge: (
      <path d="M90 81v9l6 4" fill="none" stroke={WHITE} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  locked: {
    backdrop: "#EEF1F6",
    face: (
      <>
        {dot(51, 56)}
        {dot(69, 56)}
        <path d="M53 66h14" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
      </>
    ),
    badgeFill: INK,
    badge: (
      <>
        <rect x={82} y={88} width={16} height={11} rx={3} fill={WHITE} />
        <path d="M85 88v-3a5 5 0 0 1 10 0v3" fill="none" stroke={WHITE} strokeWidth={3} strokeLinecap="round" />
      </>
    ),
  },
  switch: {
    backdrop: "#ECE6FF",
    face: (
      <>
        {dot(53, 56)}
        {dot(71, 56)}
        <path d="M47 49l8 1M65 50l8-1" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
        <path d="M54 66q3-3 6 0t6 0" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
      </>
    ),
    badgeFill: "#5B3FC4",
    badge: (
      <path
        d="M82 86h14l-4-4M98 94H84l4 4"
        fill="none"
        stroke={WHITE}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  notfound: {
    backdrop: "#E3EEFF",
    extra: (
      <path d="M96 26q5-7 0-11q-6-3-9 3M95 33v.5" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
    ),
    face: (
      <>
        {dot(51, 55)}
        {dot(69, 55)}
        <circle cx={60} cy={67} r={3.5} fill="none" stroke={INK} strokeWidth={3.5} />
      </>
    ),
    badgeFill: "#1F5FD0",
    badge: (
      <>
        <circle cx={88} cy={88} r={5.5} fill="none" stroke={WHITE} strokeWidth={3.2} />
        <path d="M92.5 92.5l5 5" fill="none" stroke={WHITE} strokeWidth={3.5} strokeLinecap="round" />
      </>
    ),
  },
  closed: {
    backdrop: "#EEF1F6",
    extra: (
      <path d="M88 22l3 5M97 20l-1 6M104 26l-5 4" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
    ),
    face: (
      <>
        <path d="M47 55q4 4 8 0M65 55q4 4 8 0" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
        <path d="M54 66h12" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
      </>
    ),
    badgeFill: "#5B6577",
    badge: <path d="M82 90h16" fill="none" stroke={WHITE} strokeWidth={4} strokeLinecap="round" />,
  },
  empty: {
    backdrop: "#E3EEFF",
    dashed: true,
    face: (
      <>
        {dot(51, 56)}
        {dot(69, 56)}
        <path d="M54 65q6 5 12 0" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
      </>
    ),
    badgeFill: SUN,
    badge: <path d="M90 82v16M82 90h16" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />,
  },
  delete: {
    backdrop: "#FFE4E0",
    face: (
      <>
        {dot(51, 57)}
        {dot(69, 57)}
        <path d="M46 51l8-2M74 51l-8-2" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
        <path d="M52 67q4-4 8 0t8 0" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
      </>
    ),
    badgeFill: "#C8372D",
    badge: (
      <path
        d="M82 85h16M85 85v12h10V85M88 81h4"
        fill="none"
        stroke={WHITE}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
};

/** The clipboard body, shared by every mood. */
function Clipboard({ dashed }: { dashed?: boolean }) {
  return (
    <>
      <rect
        x={30}
        y={28}
        width={60}
        height={72}
        rx={14}
        fill={WHITE}
        stroke={INK}
        strokeWidth={3.5}
        strokeDasharray={dashed ? "7 6" : undefined}
        strokeLinecap={dashed ? "round" : undefined}
      />
      <rect x={46} y={20} width={28} height={15} rx={7} fill={SUN} stroke={INK} strokeWidth={3.5} />
      <path d="M42 82h20M42 90h12" fill="none" stroke={LINE} strokeWidth={4} strokeLinecap="round" />
      <circle cx={44} cy={66} r={4} fill={BLUSH} />
      <circle cx={76} cy={66} r={4} fill={BLUSH} />
    </>
  );
}

export default function Mascot({
  mood,
  size = 120,
  className,
}: {
  mood: MascotMood;
  size?: number;
  className?: string;
}) {
  const art = MOOD_ART[mood];
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx={60} cy={62} r={54} fill={art.backdrop} />
      <Clipboard dashed={art.dashed} />
      {art.face}
      {art.extra}
      <circle cx={90} cy={90} r={17} fill={art.badgeFill} stroke={INK} strokeWidth={3.5} />
      {art.badge}
    </svg>
  );
}
