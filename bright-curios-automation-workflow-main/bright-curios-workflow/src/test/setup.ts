import "dotenv/config";
import "@testing-library/jest-dom";
// Ensure fetch is available (Node 18+ has fetch, but keep for safety in jsdom tests)
if (!globalThis.fetch) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  globalThis.fetch = require("node-fetch");
}
