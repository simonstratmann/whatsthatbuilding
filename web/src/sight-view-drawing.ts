import type { Candidate, Identification } from "@whatisthatbuilding/shared";
import type { CandidatePicture } from "./candidate-map.ts";
import { slotClass } from "./candidate-slots.ts";
import { NUMBER_RADIUS, sightView, type SightView } from "./sight-view.ts";

const SVG = "http://www.w3.org/2000/svg";

/**
 * The Sight View in SVG: each Candidate's walls and roof, in the mini-map's colours, with its
 * number above it, Hidden Candidates again as dashed outlines over what hides them, the
 * Surroundings in grey, and faint lines for the Line of Sight and the
 * Sight Cone's edges. Tapping a Candidate or its number calls `onTap`; the Surroundings ignore taps.
 */
export function drawSightView(
  element: HTMLElement,
  identification: Identification,
  onTap: (candidate: Candidate) => void,
): CandidatePicture {
  const svg = document.createElementNS(SVG, "svg");
  svg.classList.add("sight-view");
  // Ground at the bottom of the box; sky fills whatever's left above.
  svg.setAttribute("preserveAspectRatio", "xMidYMax meet");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "The Candidates as seen from where you stood");
  element.append(svg);

  svg.addEventListener("click", (event) => {
    const tapped = (event.target as Element).closest("[data-number]");
    const number = Number(tapped?.getAttribute("data-number"));
    const candidate = identification.candidates.find((c) => c.number === number);
    if (candidate) onTap(candidate);
  });

  const draw = (chosen?: number) => {
    // Once one is selected, the others step back.
    svg.classList.toggle("has-selection", chosen !== undefined);
    drawInto(svg, sightView(identification, chosen));
  };
  draw();
  return { highlight: draw, destroy() {} };
}

/** Replaces what the SVG shows with the view. */
function drawInto(svg: SVGSVGElement, view: SightView): void {
  svg.setAttribute("viewBox", `0 0 ${view.width} ${view.height}`);
  svg.replaceChildren();

  for (const { points, surface, role, number, chosen, hidden } of view.polygons) {
    svg.append(
      element("polygon", {
        points: points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
        class: [
          "building",
          role,
          surface,
          number === undefined ? "" : slotClass(number),
          chosen ? "chosen" : "",
          hidden ? "hidden-outline" : "",
        ]
          .filter(Boolean)
          .join(" "),
        // Only Candidates can be chosen: a tap on the Surroundings finds no number.
        ...(number === undefined ? {} : { "data-number": String(number) }),
      }),
    );
  }

  const markers = [
    { x: view.lineOfSightX, className: "line-of-sight" },
    ...view.sightConeEdgesX.map((x) => ({ x, className: "sight-cone-edge" })),
  ];
  for (const { x, className } of markers) {
    svg.append(element("line", { x1: String(x), x2: String(x), y1: "0", y2: String(view.height), class: className }));
  }

  for (const { number, x, y, anchorX, anchorY, chosen } of view.numbers) {
    const label = element("g", {
      class: `number ${slotClass(number)}${chosen ? " chosen" : ""}`,
      "data-number": String(number),
    });
    label.append(
      // From the bottom of the circle to the top of its building.
      element("line", {
        x1: x.toFixed(1),
        y1: (y + NUMBER_RADIUS).toFixed(1),
        x2: anchorX.toFixed(1),
        y2: anchorY.toFixed(1),
        class: "pointer",
      }),
      element("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: String(NUMBER_RADIUS) }),
      element("text", { x: x.toFixed(1), y: y.toFixed(1) }, String(number)),
    );
    svg.append(label);
  }
}

function element(name: string, attributes: Record<string, string>, text?: string): SVGElement {
  const created = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) created.setAttribute(key, value);
  if (text !== undefined) created.textContent = text;
  return created;
}
