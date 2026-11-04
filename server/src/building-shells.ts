import {
  edges,
  type BuildingShell,
  type LatLng,
  type Point,
  type ShellPoint,
  type SurfaceKind,
} from "@whatisthatbuilding/shared";

/** A point of a Building Shell as stored: where it is, and its elevation above sea level in metres. */
export interface ShellPosition extends LatLng {
  elevation: number;
}

/** One surface of a stored Shell: a wall, roof or ground, as an outer ring of positions. */
export interface StoredSurface {
  kind: SurfaceKind;
  /** The outer ring, without its closing point. */
  ring: ShellPosition[];
}

/** A building's walls, roof and ground as the building model has them. */
export type StoredShell = StoredSurface[];

/**
 * A stored Shell in metres around the user, as `toLocal` places positions, standing on its own
 * ground: "up" is measured from its lowest point.
 */
export function localShell(shell: StoredShell, toLocal: (p: LatLng) => Point): BuildingShell {
  const ground = Math.min(...shell.flatMap(({ ring }) => ring.map((p) => p.elevation)));
  return shell.map(({ kind, ring }) => ({
    kind,
    ring: ring.map((p): ShellPoint => {
      const { x, y } = toLocal(p);
      return [rounded(x), rounded(y), rounded(p.elevation - ground)];
    }),
  }));
}

/** For a Footprint whose height the building model doesn't give: about two storeys and a roof. */
const DEFAULT_HEIGHT_METRES = 10;

/**
 * A building's Footprint raised to its height, for one the building model has no Shell for:
 * a ground and a flat roof per ring, and a wall along each edge. `rings` are in metres
 * around the user.
 */
export function blockShell(rings: Point[][], heightMetres = DEFAULT_HEIGHT_METRES): BuildingShell {
  const at = ({ x, y }: Point, up: number): ShellPoint => [rounded(x), rounded(y), rounded(up)];
  return rings.flatMap((ring): BuildingShell => [
    { kind: "ground", ring: ring.map((p) => at(p, 0)) },
    { kind: "roof", ring: ring.map((p) => at(p, heightMetres)) },
    ...Array.from(edges(ring), ([a, b]) => ({
      kind: "wall" as const,
      ring: [at(a, 0), at(b, 0), at(b, heightMetres), at(a, heightMetres)],
    })),
  ]);
}

/** To 0.1 m: finer than the building model's accuracy, and short in the response. */
function rounded(metres: number): number {
  // Adding 0 turns a −0 into 0.
  return Math.round(metres * 10) / 10 + 0;
}
