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
 * Corporate Memphis illustrations: flat shapes, no outlines, one long-limbed
 * figure and one prop per scene. The colours are fixed on purpose so the art
 * reads the same in every contrast theme.
 */
const INK = "#1B2540";
const WHITE = "#FFFFFF";
const PINK = "#FFE4E0";
const LINE = "#C9D3E6";
const SUN = "#FFC83D";
const SUN_DEEP = "#E8B12E";
const CORAL = "#FF7A59";
const BLUE = "#1F5FD0";
const VIOLET = "#7B5CFA";
const GREEN = "#17A673";
const RED = "#E5484D";
const SKIN_TAN = "#C68B5E";
const SKIN_LIGHT = "#F2C5A0";
const SKIN_DEEP = "#8D5A3B";

type Point = readonly [number, number];

/** A foot: the centre of the ellipse and its half-width (it is 5 tall). */
interface Foot {
  cx: number;
  cy: number;
  rx: number;
}

/** An arm from the shoulder: the elbow, then the hand. */
interface Arm {
  elbow: Point;
  hand: Point;
}

/** Limb coordinates for one figure, copied from the scene art. */
interface Pose {
  legs: readonly [readonly Point[], readonly Point[]];
  feet: readonly [Foot, Foot];
  arms: readonly [Arm, Arm];
}

interface MoodArt {
  backdrop: string;
  /** Squiggle, dot, triangle and square, in that order. */
  confetti: readonly [string, string, string, string];
  /** Left edge of the torso. */
  x: number;
  shirt: string;
  skin: string;
  pose: Pose;
  /** Drawn behind the figure. */
  behind?: ReactNode;
  /** Drawn over the figure. */
  front?: ReactNode;
}

/** The soft blob behind every scene. */
const BLOB =
  "M32 104C20 64 52 22 100 20c46-2 82 26 80 70-2 40-20 78-70 86-46 8-90-18-78-72z";

const points = (line: readonly Point[]) => line.map(([px, py]) => `${px},${py}`).join(" ");

function Blob({ fill }: { fill: string }) {
  return <path d={BLOB} fill={fill} />;
}

function Confetti({ colours }: { colours: MoodArt["confetti"] }) {
  const [squiggle, dot, triangle, square] = colours;
  return (
    <>
      <path d="M24 46q6-8 12 0t12 0" fill="none" stroke={squiggle} strokeWidth={4} strokeLinecap="round" />
      <circle cx={168} cy={40} r={5} fill={dot} />
      <path d="M166 150l10 4-8 7z" fill={triangle} />
      <rect x={18} y={140} width={9} height={9} rx={2} transform="rotate(20 22 144)" fill={square} />
    </>
  );
}

/** A clipboard prop; `check` adds the green tick badge. */
function Clipboard({ x, y, scale, check = false }: { x: number; y: number; scale: number; check?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect width={52} height={66} rx={8} fill={WHITE} />
      <rect x={16} y={-6} width={20} height={12} rx={4} fill={SUN} />
      <rect x={10} y={18} width={32} height={5} rx={2.5} fill={LINE} />
      <rect x={10} y={30} width={24} height={5} rx={2.5} fill={LINE} />
      <rect x={10} y={42} width={28} height={5} rx={2.5} fill={LINE} />
      {check && (
        <>
          <circle cx={44} cy={58} r={14} fill={GREEN} />
          <path d="M37 58l5 5 9-10" fill="none" stroke={WHITE} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </g>
  );
}

/** One arm: a sleeve from the shoulder to the elbow, a forearm, and a hand. */
function Limb({ shoulder, arm, shirt, skin }: { shoulder: Point; arm: Arm; shirt: string; skin: string }) {
  return (
    <>
      <polyline points={points([shoulder, arm.elbow])} fill="none" stroke={shirt} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={points([arm.elbow, arm.hand])} fill="none" stroke={skin} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={arm.hand[0]} cy={arm.hand[1]} r={5} fill={skin} />
    </>
  );
}

/** The long-limbed figure: legs, feet, torso, arms, neck, head and hair. */
function Figure({ x, pose, shirt, skin }: { x: number; pose: Pose; shirt: string; skin: string }) {
  return (
    <g className="memphis-figure">
      {pose.legs.map((leg, i) => (
        <polyline key={i} points={points(leg)} fill="none" stroke={INK} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {pose.feet.map((foot, i) => (
        <ellipse key={i} cx={foot.cx} cy={foot.cy} rx={foot.rx} ry={5} fill={INK} />
      ))}
      <path d={`M${x} 80h32l3 44h-38z`} fill={shirt} />
      <Limb shoulder={[x + 1, 82]} arm={pose.arms[0]} shirt={shirt} skin={skin} />
      <Limb shoulder={[x + 31, 82]} arm={pose.arms[1]} shirt={shirt} skin={skin} />
      <rect x={x + 12} y={66} width={8} height={10} fill={skin} />
      <circle cx={x + 16} cy={60} r={11} fill={skin} />
      <path d={`M${x + 5} 58a11 11 0 0 1 22 0c-6-4-14-4-22 0z`} fill={INK} />
    </g>
  );
}

const MOOD_ART: Record<MascotMood, MoodArt> = {
  hello: {
    backdrop: "#E3EEFF",
    confetti: [VIOLET, SUN, BLUE, SUN],
    x: 66,
    shirt: CORAL,
    skin: SKIN_TAN,
    pose: {
      legs: [
        [[75, 120], [70, 176]],
        [[89, 120], [96, 176]],
      ],
      feet: [
        { cx: 66, cy: 179, rx: 10 },
        { cx: 100, cy: 179, rx: 10 },
      ],
      arms: [
        { elbow: [56, 104], hand: [58, 128] },
        { elbow: [112, 66], hand: [116, 40] },
      ],
    },
    behind: <Clipboard x={122} y={70} scale={1.05} />,
  },
  loading: {
    backdrop: "#FFF1CC",
    confetti: [BLUE, CORAL, GREEN, CORAL],
    x: 68,
    shirt: VIOLET,
    skin: SKIN_LIGHT,
    pose: {
      legs: [
        [[77, 120], [72, 176]],
        [[91, 120], [98, 176]],
      ],
      feet: [
        { cx: 68, cy: 179, rx: 10 },
        { cx: 102, cy: 179, rx: 10 },
      ],
      arms: [
        { elbow: [74, 104], hand: [102, 100] },
        { elbow: [114, 98], hand: [118, 96] },
      ],
    },
    front: (
      <g transform="translate(108 76)">
        <rect width={40} height={6} rx={3} fill={INK} />
        <rect y={50} width={40} height={6} rx={3} fill={INK} />
        <path d="M6 6h28L20 28zM6 50h28L20 28z" fill={SUN} />
        <path d="M14 46h12l-6-8z" fill={CORAL} />
      </g>
    ),
  },
  success: {
    backdrop: "#DDF5E6",
    confetti: [CORAL, SUN, VIOLET, SUN],
    x: 58,
    shirt: GREEN,
    skin: SKIN_DEEP,
    pose: {
      legs: [
        [[67, 120], [62, 176]],
        [[81, 120], [88, 176]],
      ],
      feet: [
        { cx: 58, cy: 179, rx: 10 },
        { cx: 92, cy: 179, rx: 10 },
      ],
      arms: [
        { elbow: [44, 62], hand: [38, 38] },
        { elbow: [104, 62], hand: [110, 38] },
      ],
    },
    front: <Clipboard x={118} y={82} scale={1} check />,
  },
  error: {
    backdrop: "#FFE4E0",
    confetti: [VIOLET, SUN, BLUE, SUN],
    x: 60,
    shirt: BLUE,
    skin: SKIN_LIGHT,
    pose: {
      legs: [
        [[69, 120], [64, 176]],
        [[83, 120], [90, 176]],
      ],
      feet: [
        { cx: 60, cy: 179, rx: 10 },
        { cx: 94, cy: 179, rx: 10 },
      ],
      arms: [
        { elbow: [50, 104], hand: [52, 128] },
        { elbow: [104, 92], hand: [86, 62] },
      ],
    },
    front: (
      <>
        <g transform="translate(118 86)">
          <path
            d="M28 4l6 10 11-2-1 11 9 7-9 7 1 11-11-2-6 10-6-10-11 2 1-11-9-7 9-7-1-11 11 2z"
            fill={RED}
          />
          <circle cx={28} cy={30} r={9} fill={PINK} />
          <path d="M22 -4l8 14" stroke={PINK} strokeWidth={4} />
        </g>
        <text x={110} y={64} fontFamily="sans-serif" fontSize={26} fontWeight={800} fill={INK}>
          ?
        </text>
      </>
    ),
  },
  expired: {
    backdrop: "#FFF1CC",
    confetti: [BLUE, VIOLET, GREEN, VIOLET],
    x: 46,
    shirt: CORAL,
    skin: SKIN_TAN,
    pose: {
      legs: [
        [[56, 128], [88, 128], [88, 168]],
        [[68, 128], [98, 130], [100, 168]],
      ],
      feet: [
        { cx: 92, cy: 172, rx: 9 },
        { cx: 104, cy: 172, rx: 9 },
      ],
      arms: [
        { elbow: [40, 106], hand: [66, 112] },
        { elbow: [86, 104], hand: [96, 112] },
      ],
    },
    front: (
      <>
        <circle cx={140} cy={76} r={30} fill={WHITE} />
        <circle cx={140} cy={76} r={30} fill="none" stroke={SUN} strokeWidth={7} />
        <path d="M140 60v17l11 7" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <rect x={96} y={128} width={56} height={8} rx={4} fill={INK} opacity={0.15} />
      </>
    ),
  },
  locked: {
    backdrop: "#EEF1F6",
    confetti: [CORAL, SUN, GREEN, SUN],
    x: 54,
    shirt: VIOLET,
    skin: SKIN_DEEP,
    pose: {
      legs: [
        [[63, 120], [58, 176]],
        [[77, 120], [84, 176]],
      ],
      feet: [
        { cx: 54, cy: 179, rx: 10 },
        { cx: 88, cy: 179, rx: 10 },
      ],
      arms: [
        { elbow: [44, 104], hand: [46, 128] },
        { elbow: [96, 104], hand: [94, 128] },
      ],
    },
    behind: (
      <>
        <rect x={112} y={40} width={52} height={136} rx={6} fill={BLUE} />
        <circle cx={152} cy={110} r={4} fill={SUN} />
        <g transform="translate(118 92)">
          <path d="M10 14v-6a10 10 0 0 1 20 0v6" fill="none" stroke={INK} strokeWidth={6} />
          <rect y={14} width={40} height={30} rx={6} fill={SUN} />
          <circle cx={20} cy={28} r={4} fill={INK} />
        </g>
      </>
    ),
  },
  switch: {
    backdrop: "#ECE6FF",
    confetti: [SUN, GREEN, CORAL, GREEN],
    x: 58,
    shirt: BLUE,
    skin: SKIN_TAN,
    pose: {
      legs: [
        [[67, 120], [62, 176]],
        [[81, 120], [88, 176]],
      ],
      feet: [
        { cx: 58, cy: 179, rx: 10 },
        { cx: 92, cy: 179, rx: 10 },
      ],
      arms: [
        { elbow: [64, 104], hand: [92, 100] },
        { elbow: [104, 98], hand: [108, 96] },
      ],
    },
    front: (
      <>
        <rect x={98} y={84} width={46} height={30} rx={5} fill={WHITE} />
        <circle cx={110} cy={99} r={6} fill={CORAL} />
        <rect x={120} y={94} width={18} height={4} rx={2} fill={LINE} />
        <rect x={120} y={102} width={12} height={4} rx={2} fill={LINE} />
        <path
          d="M140 46h26l-7-7M166 62h-26l7 7"
          fill="none"
          stroke={VIOLET}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  notfound: {
    backdrop: "#E3EEFF",
    confetti: [CORAL, VIOLET, SUN, VIOLET],
    x: 54,
    shirt: GREEN,
    skin: SKIN_LIGHT,
    pose: {
      legs: [
        [[63, 120], [58, 176]],
        [[77, 120], [84, 176]],
      ],
      feet: [
        { cx: 54, cy: 179, rx: 10 },
        { cx: 88, cy: 179, rx: 10 },
      ],
      arms: [
        { elbow: [44, 104], hand: [46, 128] },
        { elbow: [104, 84], hand: [124, 80] },
      ],
    },
    behind: <rect x={118} y={100} width={48} height={60} rx={6} fill={WHITE} />,
    front: (
      <>
        <circle cx={132} cy={80} r={16} fill="#E3EEFF" stroke={INK} strokeWidth={6} />
        <path d="M144 92l14 14" stroke={INK} strokeWidth={8} strokeLinecap="round" />
      </>
    ),
  },
  closed: {
    backdrop: "#EEF1F6",
    confetti: [BLUE, SUN, VIOLET, SUN],
    x: 54,
    shirt: CORAL,
    skin: SKIN_DEEP,
    pose: {
      legs: [
        [[63, 120], [58, 176]],
        [[77, 120], [84, 176]],
      ],
      feet: [
        { cx: 54, cy: 179, rx: 10 },
        { cx: 88, cy: 179, rx: 10 },
      ],
      arms: [
        { elbow: [44, 104], hand: [46, 128] },
        { elbow: [96, 104], hand: [94, 128] },
      ],
    },
    front: (
      <>
        <path d="M146 44l-24 24M146 44l24 24" stroke={INK} strokeWidth={3} />
        <rect x={112} y={66} width={68} height={34} rx={6} fill={RED} />
        <text x={146} y={89} textAnchor="middle" fontFamily="sans-serif" fontSize={14} fontWeight={800} fill={WHITE}>
          CLOSED
        </text>
        <circle cx={146} cy={44} r={4} fill={INK} />
      </>
    ),
  },
  empty: {
    backdrop: "#E3EEFF",
    confetti: [CORAL, BLUE, GREEN, BLUE],
    x: 52,
    shirt: VIOLET,
    skin: SKIN_TAN,
    pose: {
      legs: [
        [[61, 120], [56, 176]],
        [[75, 120], [82, 176]],
      ],
      feet: [
        { cx: 52, cy: 179, rx: 10 },
        { cx: 86, cy: 179, rx: 10 },
      ],
      arms: [
        { elbow: [42, 104], hand: [44, 128] },
        { elbow: [102, 84], hand: [122, 80] },
      ],
    },
    behind: (
      <>
        <path d="M110 120h64l-6 52h-52z" fill={SUN} />
        <path d="M110 120l12-16h40l12 16z" fill={SUN_DEEP} />
        <path d="M150 104c0-20 10-28 18-34M150 104c-2-14-10-20-18-22" fill="none" stroke={GREEN} strokeWidth={5} strokeLinecap="round" />
      </>
    ),
  },
  delete: {
    backdrop: "#FFE4E0",
    confetti: [VIOLET, SUN, CORAL, SUN],
    x: 56,
    shirt: BLUE,
    skin: SKIN_LIGHT,
    pose: {
      legs: [
        [[65, 120], [60, 176]],
        [[79, 120], [86, 176]],
      ],
      feet: [
        { cx: 56, cy: 179, rx: 10 },
        { cx: 90, cy: 179, rx: 10 },
      ],
      arms: [
        { elbow: [46, 104], hand: [48, 128] },
        { elbow: [106, 84], hand: [126, 80] },
      ],
    },
    front: (
      <>
        <g transform="translate(118 108)">
          <rect x={-4} y={0} width={48} height={8} rx={4} fill={INK} />
          <path d="M0 12h40l-5 56H5z" fill={RED} />
          <rect x={12} y={22} width={4} height={36} rx={2} fill={PINK} opacity={0.7} />
          <rect x={24} y={22} width={4} height={36} rx={2} fill={PINK} opacity={0.7} />
        </g>
        <g transform="rotate(-18 136 70)">
          <rect x={122} y={52} width={30} height={38} rx={4} fill={WHITE} />
          <rect x={128} y={62} width={18} height={4} rx={2} fill={LINE} />
          <rect x={128} y={70} width={12} height={4} rx={2} fill={LINE} />
        </g>
      </>
    ),
  },
};

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
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <Blob fill={art.backdrop} />
      <Confetti colours={art.confetti} />
      {art.behind}
      <Figure x={art.x} pose={art.pose} shirt={art.shirt} skin={art.skin} />
      {art.front}
    </svg>
  );
}
