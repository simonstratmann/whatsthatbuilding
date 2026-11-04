import { describe, expect, it } from "vitest";
import type { Footprint, LatLng, Snapshot } from "@whatisthatbuilding/shared";
import type { StoredShell } from "./building-shells.ts";
import { identify, type FootprintSource, type LabelSource } from "./identification.ts";
import { metresFrom, offsetFrom } from "./test-geo.ts";

// The user stands here in every scenario.
const ORIGIN: LatLng = { lat: 52.52, lon: 13.405 };

/** A point `east` / `north` metres from ORIGIN. */
function offset(east: number, north: number): LatLng {
  return offsetFrom(ORIGIN, east, north);
}

/** A rectangular Footprint spanning the given metre offsets from ORIGIN. */
function building(
  id: string,
  west: number,
  south: number,
  east: number,
  north: number,
  tags: Pick<Footprint, "address" | "functionCode" | "heightMetres"> = {},
): Footprint {
  return {
    id,
    rings: [[offset(west, south), offset(east, south), offset(east, north), offset(west, north)]],
    centre: offset((west + east) / 2, (south + north) / 2),
    ...tags,
  };
}

function sourceOf(...footprints: Footprint[]): FootprintSource {
  return { covers: async () => true, footprintsAround: async () => footprints, shellsOf: async () => new Map() };
}

/** A Label source that knows these names, by Footprint ID. */
function namesOf(names: Record<string, string>): LabelSource {
  return { namesAround: async () => ({ nameOf: (footprint) => names[footprint.id] }) };
}

function facing(heading: number): Snapshot {
  return { position: ORIGIN, heading, accuracyMetres: 5, compassCalibration: "calibrated" };
}

describe("identify", () => {
  it("offers a building straight ahead as a Candidate", async () => {
    const shop = building("shop", -10, 90, 10, 110);

    const { candidates } = await identify(facing(0), sourceOf(shop));

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.footprint.id).toBe("shop");
    expect(candidates[0]?.number).toBe(1);
    expect(candidates[0]?.distanceMetres).toBeCloseTo(90, 0);
  });

  it("leaves out a building just outside the edge of the Sight Cone", async () => {
    // 1 m sheds 100 m away, centred on bearings of 14° and 16° (each spans about ±0.3°); the cone ends at 15°.
    const inside = building("inside", 23.69, 96.53, 24.69, 97.53);
    const outside = building("outside", 27.06, 95.63, 28.06, 96.63);

    const { candidates } = await identify(facing(0), sourceOf(inside, outside));

    expect(candidates.map((c) => c.footprint.id)).toEqual(["inside"]);
  });

  it("leaves out buildings nearer than 20 m, as if they weren't there", async () => {
    // A kiosk 10 m ahead hides the house behind it, and one the GPS puts the user inside.
    const kiosk = building("kiosk", -10, 10, 10, 15, { heightMetres: 30 });
    const standingIn = building("standing in", -3, -3, 3, 3, { heightMetres: 12 });
    const beside = building("beside", 8, 8, 12, 12, { heightMetres: 12 });
    const house = building("house", -5, 40, 5, 50, { heightMetres: 8 });
    // 23 m away, about 26° to the right: outside the Sight Cone, inside the Sight View.
    const justFarEnough = building("just far enough", 10, 20.5, 15, 25);

    const { candidates, surroundings } = await identify(facing(0), sourceOf(kiosk, standingIn, beside, house, justFarEnough));

    expect(candidates.map((c) => [c.footprint.id, c.hidden])).toEqual([["house", false]]);
    expect(surroundings.map((s) => s.footprintId)).toEqual(["just far enough"]);
  });

  it("leaves out a building beyond the reach of the Sight Cone", async () => {
    const near = building("near", -5, 480, 5, 490);
    const far = building("far", -5, 510, 5, 520);

    const { candidates } = await identify(facing(0), sourceOf(near, far));

    expect(candidates.map((c) => c.footprint.id)).toEqual(["near"]);
  });

  it("offers a wide building that spans the Sight Cone with all its corners outside it", async () => {
    const terrace = building("terrace", -200, 300, 200, 320);

    const { candidates } = await identify(facing(0), sourceOf(terrace));

    expect(candidates.map((c) => c.footprint.id)).toEqual(["terrace"]);
    expect(candidates[0]?.distanceMetres).toBeCloseTo(300, 0);
  });

  it("offers a large building whose near side only reaches into the far end of the Sight Cone", async () => {
    // Its near side, 490 m away, crosses the cone's sides beyond 500 m but dips inside the range straight ahead.
    const warehouse = building("warehouse", -100, 490, 100, 600);

    const { candidates } = await identify(facing(0), sourceOf(warehouse));

    expect(candidates.map((c) => c.footprint.id)).toEqual(["warehouse"]);
  });

  it("offers a tower rising behind a shop as well as the shop, nearest first", async () => {
    const tower = building("tower", -15, 250, 15, 280, { heightMetres: 60 });
    const shop = building("shop", -10, 40, 10, 50, { heightMetres: 10 });

    const { candidates } = await identify(facing(0), sourceOf(tower, shop));

    expect(candidates.map((c) => [c.number, c.footprint.id])).toEqual([
      [1, "shop"],
      [2, "tower"],
    ]);
  });

  it("ranks a tall building behind a low one above a nearer building the low one hides", async () => {
    // From eye height the shop's top is 12° up; the house behind it reaches 4°, the tower 21°.
    const shop = building("shop", -30, 40, 30, 50, { heightMetres: 10 });
    const house = building("house", -10, 100, 10, 110, { heightMetres: 8 });
    const tower = building("tower", -15, 250, 15, 280, { heightMetres: 100 });

    const { candidates } = await identify(facing(0), sourceOf(tower, house, shop));

    expect(candidates.map((c) => [c.number, c.footprint.id])).toEqual([
      [1, "shop"],
      [2, "tower"],
      [3, "house"],
    ]);
  });

  it("keeps a fully hidden building in the list, below the visible ones", async () => {
    const shop = building("shop", -6, 40, 6, 50, { heightMetres: 10 });
    const hidden = building("hidden", -5, 60, 5, 70, { heightMetres: 5 });
    // Off to the side of the shop, so nothing stands in front of it.
    const shed = building("shed", 20, 90, 24, 94, { heightMetres: 3 });

    const { candidates } = await identify(facing(0), sourceOf(hidden, shed, shop));

    expect(candidates.map((c) => [c.footprint.id, c.hidden])).toEqual([
      ["shop", false],
      ["shed", false],
      ["hidden", true],
    ]);
  });

  it("counts a building as visible when only one edge of its span in the Sight Cone is hidden", async () => {
    // The shop covers the left of the cone; the long block behind it shows over the right.
    const shop = building("shop", -30, 50, -3, 60, { heightMetres: 10 });
    const block = building("block", -100, 200, 100, 210, { heightMetres: 12 });
    const behindShop = building("behind shop", -15, 100, -10, 105, { heightMetres: 5 });

    const { candidates } = await identify(facing(0), sourceOf(block, behindShop, shop));

    expect(candidates.map((c) => c.footprint.id)).toEqual(["shop", "block", "behind shop"]);
  });

  it("treats buildings of unknown height as visible, and as hiding nothing", async () => {
    const unknownShop = building("unknown shop", -20, 40, 20, 50);
    const behindUnknown = building("behind unknown", -5, 60, 5, 70, { heightMetres: 3 });
    const tallShop = building("tall shop", -20, 150, 20, 160, { heightMetres: 30 });
    const unknownBehindTall = building("unknown behind tall", -5, 200, 5, 210);
    // Shows over the tall shop, so it would rank above the building behind the shop were that hidden.
    const tower = building("tower", -10, 300, 10, 310, { heightMetres: 100 });

    const { candidates } = await identify(
      facing(0),
      sourceOf(tower, unknownBehindTall, tallShop, behindUnknown, unknownShop),
    );

    expect(candidates.map((c) => c.footprint.id)).toEqual([
      "unknown shop",
      "behind unknown",
      "tall shop",
      "unknown behind tall",
      "tower",
    ]);
  });

  it("offers only the nearest 8 when more buildings fall in the Sight Cone", async () => {
    // A row of ten houses straight ahead, 30 m apart, listed farthest first.
    const houses = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => building(`house-${n}`, -5, n * 30, 5, n * 30 + 10));

    const { candidates } = await identify(facing(0), sourceOf(...houses));

    expect(candidates.map((c) => [c.number, c.footprint.id])).toEqual([
      [1, "house-1"],
      [2, "house-2"],
      [3, "house-3"],
      [4, "house-4"],
      [5, "house-5"],
      [6, "house-6"],
      [7, "house-7"],
      [8, "house-8"],
    ]);
  });

  it("caps the list at 8 after ranking, so a hidden building can drop off it", async () => {
    // Ten houses straight ahead, each taller than the one before, so every one shows over the last.
    const houses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
      building(`house-${n}`, -5, n * 30, 5, n * 30 + 10, { heightMetres: 10 * n }),
    );
    // Nearer than all but the first house, and hidden behind it.
    const shed = building("shed", -2, 45, 2, 50, { heightMetres: 3 });

    const { candidates } = await identify(facing(0), sourceOf(shed, ...houses));

    expect(candidates.map((c) => c.footprint.id)).toEqual([
      "house-1",
      "house-2",
      "house-3",
      "house-4",
      "house-5",
      "house-6",
      "house-7",
      "house-8",
    ]);
  });

  it.each([
    // Facing 355°, the cone runs 340°–10°; facing 5°, it runs 350°–20°.
    { heading: 355, expected: ["15° west of north", "5° east of north", "5° west of north"] },
    { heading: 5, expected: ["15° east of north", "5° east of north", "5° west of north"] },
  ])("handles a Line of Sight close to north (heading $heading°)", async ({ heading, expected }) => {
    // Small buildings 100 m away at bearings of 5°, 15°, 345° and 355°.
    const buildings = [
      building("5° east of north", 7.7, 98.6, 9.7, 100.6),
      building("15° east of north", 24.9, 95.6, 26.9, 97.6),
      building("15° west of north", -26.9, 95.6, -24.9, 97.6),
      building("5° west of north", -9.7, 98.6, -7.7, 100.6),
    ];

    const { candidates } = await identify(facing(heading), sourceOf(...buildings));

    expect(candidates.map((c) => c.footprint.id).sort()).toEqual(expected);
  });

  it("leaves out the building the user is standing in", async () => {
    const arcade = building("arcade", -20, -20, 20, 20);

    const { candidates, surroundings } = await identify(facing(90), sourceOf(arcade));

    expect(candidates).toEqual([]);
    expect(surroundings).toEqual([]);
  });

  it("leaves out a building behind the user even when one of its corners is exactly where they stand", async () => {
    const behind = building("behind", 0, -20, 20, 0);

    const { candidates } = await identify(facing(0), sourceOf(behind));

    expect(candidates).toEqual([]);
  });

  it("leaves out a building whose wall the user stands exactly on", async () => {
    // A vast hall to the south; the user stands on its north wall, facing into it.
    const hall = building("hall", -1000, -1000, 1000, 0);

    const { candidates } = await identify(facing(180), sourceOf(hall));

    expect(candidates).toEqual([]);
  });

  it.each([
    {
      known: "name and address",
      name: "Rotes Rathaus",
      address: { street: "Rathausstraße", houseNumber: "15" },
      label: "Rotes Rathaus",
    },
    { known: "name only", name: "Rotes Rathaus", label: "Rotes Rathaus" },
    { known: "street and house number", address: { street: "Rathausstraße", houseNumber: "15" }, label: "Rathausstraße 15" },
    { known: "street only", address: { street: "Rathausstraße" }, label: "Rathausstraße" },
    { known: "house number only", address: { houseNumber: "15" }, label: undefined },
    { known: "nothing", label: undefined },
  ])(
    "labels a Candidate by its OSM name, else its street and house number (known: $known)",
    async ({ name, address, label }) => {
      const hall = building("hall", -10, 90, 10, 110, address ? { address } : {});

      const { candidates } = await identify(facing(0), sourceOf(hall), namesOf(name ? { hall: name } : {}));

      expect(candidates[0]?.location.label).toBe(label);
      expect(candidates[0]?.footprint.name).toBe(name);
    },
  );

  it("asks for names around the user, out to the reach of the Sight Cone", async () => {
    const asked: [LatLng, number][] = [];
    const labels: LabelSource = {
      namesAround: async (centre, radius) => (asked.push([centre, radius]), { nameOf: () => undefined }),
    };

    await identify(facing(0), sourceOf(building("hall", -10, 90, 10, 110)), labels);

    expect(asked).toEqual([[ORIGIN, 500]]);
  });

  it("labels Candidates by their addresses when the Label source fails", async () => {
    const hall = building("hall", -10, 90, 10, 110, { address: { street: "Rathausstraße", houseNumber: "15" } });
    const failing: LabelSource = {
      namesAround: async () => {
        throw new Error("Overpass request failed: 504");
      },
    };

    const { candidates } = await identify(facing(0), sourceOf(hall), failing);

    expect(candidates.map((c) => [c.footprint.id, c.location.label])).toEqual([["hall", "Rathausstraße 15"]]);
  });

  it("names each Candidate's building type from its AdV function code", async () => {
    const home = building("home", -10, 90, 10, 110, { functionCode: "31001_1010" });
    const church = building("church", -10, 150, 10, 170, { functionCode: "31001_3041" });

    const { candidates } = await identify(facing(0), sourceOf(home, church));

    expect(candidates.map((c) => c.buildingType)).toEqual(["Wohnhaus", "Kirche"]);
  });

  it("calls a building with an unknown function code just a building, and leaves out the type when there's no code", async () => {
    const odd = building("odd", -10, 90, 10, 110, { functionCode: "31001_7777" });
    const bare = building("bare", -10, 150, 10, 170);

    const { candidates } = await identify(facing(0), sourceOf(odd, bare));

    expect(candidates[0]?.buildingType).toBe("Gebäude");
    expect(candidates[1]).not.toHaveProperty("buildingType");
  });

  it("puts a Candidate's Location at the centre of its Footprint, with a geo: link carrying the label", async () => {
    const cafe = { ...building("cafe", -10, 90, 10, 110), centre: { lat: 52.5209, lon: 13.405 } };

    const { candidates } = await identify(facing(0), sourceOf(cafe), namesOf({ cafe: "Café (Old Town) & Bar #1" }));

    expect(candidates[0]?.location).toEqual({
      position: { lat: 52.5209, lon: 13.405 },
      label: "Café (Old Town) & Bar #1",
      geoUri: "geo:52.5209,13.405?q=52.5209,13.405(Caf%C3%A9%20%28Old%20Town%29%20%26%20Bar%20%231)",
    });
  });

  it("gives an unlabelled Location a geo: link with just the pin", async () => {
    const shed = {
      ...building("shed", -10, 90, 10, 110),
      // Rounded to 7 decimal places (about 1 cm) in the link.
      centre: { lat: 52.520900004, lon: 13.40500000049 },
    };

    const { candidates } = await identify(facing(0), sourceOf(shed));

    expect(candidates[0]?.location.geoUri).toBe("geo:52.5209,13.405?q=52.5209,13.405");
  });

  it("gives no warnings for a precise Snapshot with a calibrated compass that finds a building", async () => {
    const { warnings } = await identify(facing(0), sourceOf(building("shop", -10, 90, 10, 110)));

    expect(warnings).toEqual([]);
  });

  it("warns that the position is imprecise when GPS accuracy is worse than 30 m, and still offers the Candidates", async () => {
    const shop = building("shop", -10, 90, 10, 110);

    const atThirty = await identify({ ...facing(0), accuracyMetres: 30 }, sourceOf(shop));
    const beyond = await identify({ ...facing(0), accuracyMetres: 31 }, sourceOf(shop));

    expect(atThirty.warnings).toEqual([]);
    expect(beyond.warnings).toEqual(["imprecise-location"]);
    expect(beyond.candidates.map((c) => c.footprint.id)).toEqual(["shop"]);
  });

  it("asks for the compass to be calibrated when the platform says it isn't, but not when it can't tell", async () => {
    const shop = building("shop", -10, 90, 10, 110);

    const uncalibrated = await identify({ ...facing(0), compassCalibration: "uncalibrated" }, sourceOf(shop));
    const unknown = await identify({ ...facing(0), compassCalibration: "unknown" }, sourceOf(shop));

    expect(uncalibrated.warnings).toEqual(["compass-uncalibrated"]);
    expect(uncalibrated.candidates).toHaveLength(1);
    expect(unknown.warnings).toEqual([]);
  });

  it("warns that nothing was found when no building falls in the Sight Cone", async () => {
    const behind = building("behind", -10, -110, 10, -90);

    const { candidates, warnings } = await identify(facing(0), sourceOf(behind));

    expect(candidates).toEqual([]);
    expect(warnings).toEqual(["nothing-found"]);
  });

  it("gives every warning that applies, so an empty list can be put down to a poor reading", async () => {
    const { warnings } = await identify(
      { ...facing(0), accuracyMetres: 80, compassCalibration: "uncalibrated" },
      sourceOf(),
    );

    expect(warnings).toEqual(["imprecise-location", "compass-uncalibrated", "nothing-found"]);
  });

  it("warns that a Snapshot outside the Coverage Area has no building data, and offers no Candidates", async () => {
    const shop = building("shop", -10, 90, 10, 110);
    const asked: LatLng[] = [];
    const source: FootprintSource = {
      ...sourceOf(),
      covers: async (position) => (asked.push(position), false),
      footprintsAround: async () => [shop],
    };

    const { candidates, warnings, lineOfSight } = await identify(facing(0), source);

    expect(asked).toEqual([ORIGIN]);
    expect(candidates).toEqual([]);
    expect(warnings).toEqual(["outside-coverage-area"]);
    // The mini-map can still show where the user stood and looked.
    expect(lineOfSight.from).toEqual(ORIGIN);
  });

  it("asks for the Footprints while it checks the Coverage Area, so a source that downloads them can do both at once", async () => {
    const shop = building("shop", -10, 90, 10, 110);
    let footprintsAsked!: () => void;
    const asked = new Promise<void>((resolve) => (footprintsAsked = resolve));
    const source: FootprintSource = {
      ...sourceOf(),
      // Answers only once the Footprints have been asked for.
      covers: async () => (await asked, true),
      footprintsAround: async () => (footprintsAsked(), [shop]),
    };

    const { candidates } = await identify(facing(0), source);

    expect(candidates.map((c) => c.footprint.id)).toEqual(["shop"]);
  });

  it("warns about a Snapshot outside the Coverage Area even when the Footprints around it can't be had", async () => {
    const source: FootprintSource = {
      ...sourceOf(),
      covers: async () => false,
      footprintsAround: async () => {
        throw new Error("download failed");
      },
    };

    const { warnings } = await identify(facing(0), source);

    expect(warnings).toEqual(["outside-coverage-area"]);
  });

  it("fails when the Footprints can't be had inside the Coverage Area", async () => {
    const source: FootprintSource = {
      ...sourceOf(),
      covers: async () => true,
      footprintsAround: async () => {
        throw new Error("download failed");
      },
    };

    await expect(identify(facing(0), source)).rejects.toThrow(/download failed/);
  });

  it("gives a Candidate without a Building Shell a block: its Footprint raised to its height", async () => {
    const shop = building("shop", -10, 90, 10, 110, { heightMetres: 12.34 });

    const { candidates } = await identify(facing(0), sourceOf(shop));

    const shell = candidates[0]!.shell;
    const ground = shell.filter((s) => s.kind === "ground");
    const roofs = shell.filter((s) => s.kind === "roof");
    const walls = shell.filter((s) => s.kind === "wall");
    expect(ground.map((s) => s.ring)).toEqual([
      [
        [-10, 90, 0],
        [10, 90, 0],
        [10, 110, 0],
        [-10, 110, 0],
      ],
    ]);
    expect(roofs.map((s) => s.ring)).toEqual([
      [
        [-10, 90, 12.3],
        [10, 90, 12.3],
        [10, 110, 12.3],
        [-10, 110, 12.3],
      ],
    ]);
    expect(walls.map((s) => s.ring)).toEqual([
      [[-10, 90, 0], [10, 90, 0], [10, 90, 12.3], [-10, 90, 12.3]],
      [[10, 90, 0], [10, 110, 0], [10, 110, 12.3], [10, 90, 12.3]],
      [[10, 110, 0], [-10, 110, 0], [-10, 110, 12.3], [10, 110, 12.3]],
      [[-10, 110, 0], [-10, 90, 0], [-10, 90, 12.3], [-10, 110, 12.3]],
    ]);
  });

  it("gives a Candidate its stored Building Shell, in metres around the user, standing on its own ground", async () => {
    const chapel = building("chapel", -5, 95, 5, 105, { heightMetres: 12 });
    // On a hillside 40 m above sea level, with a gable roof running north–south.
    const at = (east: number, north: number, elevation: number) => ({ ...offset(east, north), elevation });
    const shell: StoredShell = [
      { kind: "ground", ring: [at(-5, 95, 40.03), at(5, 95, 40.03), at(5, 105, 40), at(-5, 105, 40)] },
      { kind: "roof", ring: [at(-5, 95, 46), at(0, 95, 52.04), at(0, 105, 52.04), at(-5, 105, 46)] },
      { kind: "wall", ring: [at(-5, 95, 40.03), at(5, 95, 40.03), at(5, 95, 46), at(0, 95, 52.04), at(-5, 95, 46)] },
    ];
    const source: FootprintSource = { ...sourceOf(chapel), shellsOf: async (ids) => new Map(ids.includes("chapel") ? [["chapel", shell]] : []) };

    const { candidates } = await identify(facing(0), source);

    expect(candidates[0]?.shell).toEqual([
      { kind: "ground", ring: [[-5, 95, 0], [5, 95, 0], [5, 105, 0], [-5, 105, 0]] },
      { kind: "roof", ring: [[-5, 95, 6], [0, 95, 12], [0, 105, 12], [-5, 105, 6]] },
      { kind: "wall", ring: [[-5, 95, 0], [5, 95, 0], [5, 95, 6], [0, 95, 12], [-5, 95, 6]] },
    ]);
  });

  it("gives a block to a Candidate the source has no Shell for", async () => {
    const shed = building("shed", -5, 95, 5, 105, { heightMetres: 3 });
    const source = sourceOf(shed);

    const { candidates } = await identify(facing(0), source);

    expect(candidates[0]?.shell.filter((s) => s.kind === "wall")).toHaveLength(4);
    expect(candidates[0]?.shell.find((s) => s.kind === "roof")?.ring[0]).toEqual([-5, 95, 3]);
  });

  it("raises a Footprint of unknown height to a default height, so it can still be drawn", async () => {
    const unknown = building("unknown", -10, 90, 10, 110);

    const { candidates } = await identify(facing(0), sourceOf(unknown));

    const roofHeights = candidates[0]!.shell.filter((s) => s.kind === "roof").flatMap((s) => s.ring.map(([, , up]) => up));
    expect(roofHeights.length).toBeGreaterThan(0);
    expect(new Set(roofHeights).size).toBe(1);
    expect(roofHeights[0]).toBeGreaterThan(3);
  });

  it("gives each part of a Footprint of several parts its own block", async () => {
    const pair: Footprint = {
      ...building("pair", -10, 90, 0, 100, { heightMetres: 8 }),
      rings: [
        [offset(-10, 90), offset(0, 90), offset(0, 100), offset(-10, 100)],
        [offset(0, 90), offset(10, 90), offset(10, 100)],
      ],
    };

    const { candidates } = await identify(facing(0), sourceOf(pair));

    const shell = candidates[0]!.shell;
    expect(shell.filter((s) => s.kind === "ground")).toHaveLength(2);
    expect(shell.filter((s) => s.kind === "roof")).toHaveLength(2);
    expect(shell.filter((s) => s.kind === "wall")).toHaveLength(7);
  });

  it("gives as Surroundings the buildings within ±30° and 500 m that aren't Candidates", async () => {
    const ahead = building("ahead", -5, 100, 5, 110);
    // About 25° to the right and left: outside the Sight Cone, inside the Sight View.
    const right = building("right", 40, 95, 50, 105);
    const left = building("left", -50, 95, -40, 105);
    // About 40° to the right, beyond 500 m, and behind the user.
    const wide = building("wide", 75, 95, 85, 105);
    const far = building("far", 240, 470, 250, 480);
    const behind = building("behind", -5, -110, 5, -100);

    const { candidates, surroundings } = await identify(facing(0), sourceOf(ahead, right, left, wide, far, behind));

    expect(candidates.map((c) => c.footprint.id)).toEqual(["ahead"]);
    expect(surroundings.map((s) => s.footprintId).sort()).toEqual(["left", "right"]);
  });

  it("leaves out Surroundings that nearer buildings hide completely, but keeps a tower showing over them", async () => {
    // A long, tall block 25° to the right, with a low house and a tall tower behind it.
    const block = building("block", 25, 60, 60, 70, { heightMetres: 20 });
    const hiddenHouse = building("hidden house", 40, 100, 50, 110, { heightMetres: 8 });
    const tower = building("tower", 70, 150, 80, 160, { heightMetres: 80 });
    const ahead = building("ahead", -5, 100, 5, 110, { heightMetres: 10 });

    const { surroundings } = await identify(facing(0), sourceOf(ahead, block, hiddenHouse, tower));

    expect(surroundings.map((s) => s.footprintId).sort()).toEqual(["block", "tower"]);
  });

  it("never gives a Candidate as Surroundings, but does give a building the list has no room for", async () => {
    const houses = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => building(`house-${n}`, -5, n * 30, 5, n * 30 + 10));

    const { candidates, surroundings } = await identify(facing(0), sourceOf(...houses));

    const candidateIds = candidates.map((c) => c.footprint.id);
    expect(candidateIds).toHaveLength(8);
    expect(surroundings.map((s) => s.footprintId)).toEqual(["house-9"]);
  });

  it("gives each Surroundings building its Shell in metres around the user, or a block", async () => {
    const at = (east: number, north: number, elevation: number) => ({ ...offset(east, north), elevation });
    const shell: StoredShell = [{ kind: "roof", ring: [at(40, 95, 60), at(50, 95, 60), at(45, 105, 65)] }];
    const right = building("right", 40, 95, 50, 105, { heightMetres: 8 });
    const left = building("left", -50, 95, -40, 105, { heightMetres: 6 });
    const source: FootprintSource = {
      ...sourceOf(right, left),
      shellsOf: async (ids) => new Map(ids.includes("right") ? [["right", shell]] : []),
    };

    const { surroundings } = await identify(facing(0), source);

    expect(surroundings.find((s) => s.footprintId === "right")?.shell).toEqual([
      { kind: "roof", ring: [[40, 95, 0], [50, 95, 0], [45, 105, 5]] },
    ]);
    expect(surroundings.find((s) => s.footprintId === "left")?.shell.find((s) => s.kind === "roof")?.ring[0]).toEqual([
      -50, 95, 6,
    ]);
  });

  it("gives no Surroundings outside the Coverage Area", async () => {
    const source: FootprintSource = { ...sourceOf(building("right", 40, 95, 50, 105)), covers: async () => false };

    const { surroundings } = await identify(facing(0), source);

    expect(surroundings).toEqual([]);
  });

  it("describes the Sight Cone it searched: from the user out to 500 m, ±15° around the heading", async () => {
    const { sightCone } = await identify(facing(355), sourceOf());

    const [apex, ...arc] = sightCone;
    expect(apex).toEqual(ORIGIN);
    const bearings = arc.map((p) => bearingFromOrigin(p));
    const distances = arc.map((p) => distanceFromOrigin(p));
    expect(bearings[0]).toBeCloseTo(340, 6);
    expect(bearings.at(-1)).toBeCloseTo(10, 6);
    for (const d of distances) expect(d).toBeCloseTo(500, 6);
  });

  it("describes the Line of Sight: from the user along the heading to the far edge of the Sight Cone", async () => {
    const { lineOfSight } = await identify(facing(355), sourceOf());

    expect(lineOfSight.from).toEqual(ORIGIN);
    expect(bearingFromOrigin(lineOfSight.to)).toBeCloseTo(355, 6);
    expect(distanceFromOrigin(lineOfSight.to)).toBeCloseTo(500, 6);
  });
});

function toMetres(p: LatLng): { east: number; north: number } {
  return metresFrom(ORIGIN, p);
}

function bearingFromOrigin(p: LatLng): number {
  const { east, north } = toMetres(p);
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

function distanceFromOrigin(p: LatLng): number {
  const { east, north } = toMetres(p);
  return Math.hypot(east, north);
}
