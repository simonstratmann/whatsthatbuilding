/** "Request <id>", selectable, so a test on the phone can be named when reporting what went wrong. */
export function requestIdLine(requestId: string): HTMLElement {
  const line = document.createElement("p");
  line.className = "request-id";
  const id = document.createElement("code");
  id.textContent = requestId;
  line.append("Request ", id);
  return line;
}
