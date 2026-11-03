import {
  CHOICE_PATH,
  IDENTIFY_PATH,
  type Candidate,
  type ChoiceReport,
  type IdentifyRequest,
  type Identification,
  type IdentifyResponse,
  type OrientationReading,
  type Snapshot,
} from "@whatisthatbuilding/shared";

/** What the screens show after a Snapshot; the request ID is missing only when the server couldn't be reached. */
export type IdentifyResult =
  | { requestId: string; identification: Identification }
  | { requestId?: string; error: string };

/**
 * Sends the Snapshot to the server, which identifies it and keeps it in its request log
 * under the request ID it answers with; the screens show that ID so a test can be looked up.
 */
export async function identifyOnServer(
  snapshot: Snapshot,
  mode: IdentifyRequest["mode"],
  orientation?: OrientationReading,
): Promise<IdentifyResult> {
  const request: IdentifyRequest = { snapshot, mode, ...(orientation ? { orientation } : {}) };
  try {
    const response = await fetch(IDENTIFY_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const body = (await response.json().catch(() => undefined)) as IdentifyResponse | undefined;
    if (!body) return { error: `Server answered ${response.status}` };
    return body;
  } catch (error) {
    return { error: String(error) };
  }
}

/** Adds the chosen Candidate to its request's log entry. Survives the page handing off to the maps app. */
export function logChoice(requestId: string, candidate: Candidate): void {
  const report: ChoiceReport = {
    requestId,
    choice: { number: candidate.number, footprintId: candidate.footprint.id, at: new Date().toISOString() },
  };
  navigator.sendBeacon(CHOICE_PATH, new Blob([JSON.stringify(report)], { type: "application/json" }));
}
