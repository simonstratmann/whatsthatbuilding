import type { Candidate, Identification } from "@whatisthatbuilding/shared";
import type { CandidatePicture } from "./candidate-map.ts";
import { sightView, type SightView } from "./sight-view.ts";

const SVG = "http://www.w3.org/2000/svg";
const NUMBER_RADIUS = 34;

/**
 * The Sight View in SVG: each Candidate's walls and roof, in the mini-map's colours, with its
 * number above it, and faint lines for the Line of Sight and the Sight Cone's edges. Tapping a
 * Candidate or its number calls `onTap`.
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

  const draw = (chosen?: number) => render(svg, sightView(identification, chosen));
  draw();
  return { highlight: draw, destroy() {} };
}

function render(svg: SVGSVGElement, view: SightView): void {
  svg.setAttribute("viewBox", `0 0 ${view.width} ${view.height}`);
  svg.replaceChildren();

  for (const { points, surface, number, chosen } of view.polygons) {
    svg.append(
      element("polygon", {
        points: points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
        class: `building candidate ${surface}${chosen ? " chosen" : ""}`,
        "data-number": String(number),
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

  for (const { number, x, y, chosen } of view.numbers) {
    const label = element("g", { class: `number${chosen ? " chosen" : ""}`, "data-number": String(number) });
    label.append(
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
