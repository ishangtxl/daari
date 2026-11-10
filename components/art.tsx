/**
 * Daari's art: things from a Bangalore street, drawn in small square cells on one grid so they
 * sit together. A tabebuia tree, the pink trees that line the city's roads, and an auto-rickshaw
 * with its driver waiting and the passenger seat free. Art appears in headers, empty states and
 * while Daari is working, never where it would get in the way of reading.
 */

const CELL = 9;
type Cell = { x: number; y: number; fill: string };

// A small seeded generator keeps the art identical on server and client.
function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function Cells({ cells, inset = 1 }: { cells: Cell[]; inset?: number }) {
  return cells.map((cell, index) => (
    <rect key={index} x={cell.x * CELL} y={cell.y * CELL} width={CELL - inset} height={CELL - inset} fill={cell.fill} />
  ));
}

const TREE_COLUMNS = 40;

/**
 * Tall trees run off the bottom of a header; short ones end where the ground starts. `scale` draws
 * the same tree in finer cells, to stand beside the auto, which needs the finer grid.
 */
function tree(rows: number, scale = 1) {
  const random = seeded(11);
  const blobs = [
    { x: 21, y: 13, r: 11 },
    { x: 11, y: 17, r: 8 },
    { x: 31, y: 17, r: 8 },
    { x: 16, y: 8, r: 7 },
    { x: 27, y: 8, r: 7 },
  ].map((blob) => ({ x: blob.x * scale, y: blob.y * scale, r: blob.r * scale }));
  const bark = "#0D1E63";
  const cells: Cell[] = [];
  for (let y = 21 * scale; y < rows; y++) {
    for (let x = 20 * scale; x < 23 * scale; x++) cells.push({ x, y, fill: bark });
  }
  for (let i = 0; i < 6 * scale; i++) {
    for (let t = 0; t < scale; t++) {
      cells.push({ x: 20 * scale - i + t, y: 23 * scale - i, fill: bark }, { x: 23 * scale - 1 + i - t, y: 23 * scale - i, fill: bark });
    }
  }
  for (let y = 0; y < Math.min(rows, 32 * scale); y++) {
    for (let x = 0; x < TREE_COLUMNS * scale; x++) {
      const distance = Math.min(...blobs.map((blob) => Math.hypot(x - blob.x, (y - blob.y) * 1.1) / blob.r));
      if (distance < 1 && random() < 1.08 - distance * 0.55) {
        const roll = random();
        cells.push({ x, y, fill: roll < 0.08 ? "var(--auto)" : roll < 0.3 ? "#FBD3E0" : "var(--pink)" });
      }
    }
  }
  const petals = Array.from({ length: 9 }, (_, index) => ({
    x: Math.floor(random() * TREE_COLUMNS * scale),
    y: (22 + Math.floor(random() * 8)) * scale,
    size: scale,
    delay: index * 1.1,
    duration: 7 + random() * 5,
  }));
  return { cells, petals };
}

function Petals({ petals }: { petals: ReturnType<typeof tree>["petals"] }) {
  return petals.map((petal, index) => (
    <rect
      key={index}
      className="petal"
      x={petal.x * CELL}
      y={petal.y * CELL}
      width={CELL * petal.size - 2}
      height={CELL * petal.size - 2}
      fill="var(--pink)"
      style={{ animationDelay: `${petal.delay}s`, animationDuration: `${petal.duration}s` }}
    />
  ));
}

export function TabebuiaTree({ className, tall = false }: { className?: string; tall?: boolean }) {
  const rows = tall ? 120 : 38;
  const { cells, petals } = tree(rows);
  const grass: Cell[] = tall ? [] : Array.from({ length: TREE_COLUMNS - 8 }, (_, index) => ({ x: index + 4, y: rows - 1, fill: "#3E9E5B" }));
  return (
    <svg className={`tree ${className ?? ""}`} viewBox={`0 0 ${TREE_COLUMNS * CELL} ${rows * CELL}`} aria-hidden="true">
      <Cells cells={[...cells, ...grass]} />
      <Petals petals={petals} />
    </svg>
  );
}

// Bengaluru's autos: black canopy, yellow over green, black seat, and a driver in a khaki shirt.
// Lower-case keys are a darker shade of the same colour.
const AUTO = [
  "....KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK........",
  "..KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK......",
  "..KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK......",
  ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.....",
  ".KKKK............................KKWWWWK.....",
  ".KkkK....................NNNN....KKWwWWK.....",
  ".KkkK....................NNNN....KKWWWWK.....",
  ".KkkK....................SSSS....KKWwWWK.....",
  ".KkkK....................SSSs....KKKWWWWK....",
  ".KkkK....................SSSS....KKYWwWWKK...",
  ".KKKK...kkkkkkkk........CCCCCC...KKYWWWWKYK..",
  ".KKKK..Kkmmmmmmk........CCCCCCKNNKKYWWWWKYK..",
  ".KKKKKKYkkkkkkkk........CCCCCCYNNYYYYYYYYYYK.",
  ".KKKKYYKkkkkkkkk........CCCCCCCNNCYYYYYYYYYYK",
  ".KKKKYYKkkkkkkkk........CCCCCCCCCCYYYYYYYYOYK",
  ".KKKKYYKkmmmmmmmmmmmk...CCCCCCKYYYYYYYYYYYYLL",
  "..KYYYYKkkkkkkkkkkkkk...CCCCCCKYYYYYYYYYYYYLL",
  ".KYYYYYKkkkkkkkkkkkkkKKKccccccKYYYYYYYYYYYYYK",
  ".KyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyK",
  ".KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
  ".KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
  ".KgGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
  "..KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGgK",
  "..KGGGKKTTTTKKGGGGGGGGGGGGGGGGGGGKKTTTTKKGgK.",
  "..KgGK.TTTTTT.KGGGGGGGGGGGGGGGGGK.TTTTTT.KK..",
  "...KgKTTTHHTTTKGGGGGGGGGGGGGGGGGKTTTHHTTT....",
  "....K.TTHHHHTTKgggggggggggggggggKTTHHHHTT....",
  "......TTHhHHTT.KKKKKKKKKKKKKKKKK.TTHHhHTT....",
  "......TTTHHTTT...................TTTHHTTT....",
  ".......TTTTTT.....................TTTTTT.....",
  "........TTTT.......................TTTT......",
];
const AUTO_WIDTH = AUTO[0].length;
const AUTO_FILL: Record<string, string> = {
  K: "#141C33", N: "#141C33", T: "#141C33", k: "#2A3150", m: "#3A4160",
  Y: "var(--auto)", y: "#E09B12", G: "#2E8B57", g: "#1E6B42",
  W: "#BCD3FF", w: "#E8F0FF", H: "#C8D5F0", h: "#8E9CC0",
  S: "#A86B4C", s: "#8A5238", C: "#C9A96B", c: "#A88A50", L: "#FFF7C2", O: "#FF8A1F",
};
const WHEEL = new Set(["T", "H", "h"]);

function autoCells(wheels: boolean): Cell[] {
  return AUTO.flatMap((row, y) =>
    [...row].flatMap((key, x) => (AUTO_FILL[key] && WHEEL.has(key) === wheels ? [{ x, y, fill: AUTO_FILL[key] }] : [])),
  );
}

/** The body and wheels are drawn apart so the body alone can shake while the engine runs. */
function Auto() {
  return (
    <>
      <g className="auto-body"><Cells cells={autoCells(false)} inset={0} /></g>
      <Cells cells={autoCells(true)} inset={0} />
    </>
  );
}

/**
 * The first screen's picture: an auto waiting in the shade of a tabebuia, everything in cells of
 * one size. The tree and auto keep a fixed size in the middle while the road runs out to both edges
 * of however wide a screen is. The auto drives in once when the screen opens.
 */
export function Street({ className }: { className?: string }) {
  const scene = 100; // columns the tree and auto take up
  const columns = 700; // the road is far wider, for wide screens
  const left = (columns - scene) / 2;
  const rows = 88;
  const kerbAt = 74;
  const treeAt = { x: left + 24, y: 0 };
  const autoAt = { x: left + 6, y: 82 - AUTO.length };
  const { cells, petals } = tree(kerbAt, 2);
  // Ground is drawn in long strips rather than cell by cell: the same picture, far fewer shapes.
  // The kerb is painted in black and yellow blocks, as Bangalore's are, and the road has a broken white line.
  const strip = (x: number, y: number, width: number, height: number, fill: string) => (
    <rect key={`${x}-${y}`} x={x * CELL} y={y * CELL} width={width * CELL} height={height * CELL} fill={fill} />
  );
  const kerb = Array.from({ length: columns / 8 }, (_, index) => strip(index * 8 + 4, kerbAt, 4, 2, "#141C33"));
  const dashes = Array.from({ length: columns / 12 }, (_, index) => strip(index * 12, 84, 6, 2, "#C8D5F0"));
  return (
    <svg
      className={`street ${className ?? ""}`}
      shapeRendering="crispEdges"
      viewBox={`0 0 ${columns * CELL} ${rows * CELL}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      {strip(0, kerbAt, columns, 2, "var(--auto)")}
      {kerb}
      {strip(0, kerbAt + 2, columns, rows - kerbAt - 2, "#34437E")}
      {dashes}
      <g transform={`translate(${treeAt.x * CELL} ${treeAt.y * CELL})`}>
        <Cells cells={cells} />
        <Petals petals={petals} />
      </g>
      <g transform={`translate(${autoAt.x * CELL} ${autoAt.y * CELL})`}>
        <g className="auto-arrive"><Auto /></g>
      </g>
    </svg>
  );
}

/** Shown while Daari works: the auto runs along a road that keeps coming. */
export function AutoOnRoad({ className }: { className?: string }) {
  const columns = 90;
  const roadAt = AUTO.length + 1;
  const dashes: Cell[] = [];
  for (let x = 0; x < columns + 12; x++) {
    if (x % 12 < 6) dashes.push({ x, y: roadAt, fill: "var(--line)" }, { x, y: roadAt + 1, fill: "var(--line)" });
  }
  return (
    <svg className={`auto-road ${className ?? ""}`} shapeRendering="crispEdges" viewBox={`0 0 ${columns * CELL} ${(roadAt + 2) * CELL}`} aria-hidden="true">
      <g className="road-dashes"><Cells cells={dashes} inset={0} /></g>
      <g className="auto-running" transform={`translate(${Math.round((columns - AUTO_WIDTH) / 2) * CELL} 0)`}><Auto /></g>
    </svg>
  );
}
