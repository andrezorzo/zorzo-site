import { test, expect } from "@playwright/test";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// AC7: the streams the page is tested against are the API's, so every event must validate against the SSE
// schema the API publishes (zorzo-api contracts/sse-v1.schema.json, copied by tools/record_streams.py).

const FIXTURES = path.join(__dirname, "..", "fixtures");
const schema = JSON.parse(readFileSync(path.join(FIXTURES, "sse-v1.schema.json"), "utf8"));

/** The events of an SSE body, read independently of the page's reader: blank-line frames, comments skipped. */
function events(body: string) {
  return body.split(/\r?\n\r?\n/).flatMap((frame) => {
    const lines = frame.split(/\r?\n/).filter((l) => l && !l.startsWith(":"));
    if (!lines.length) return [];
    const field = (name: string) => lines.filter((l) => l.startsWith(`${name}:`)).map((l) => l.slice(name.length + 1).replace(/^ /, ""));
    return [{ event: field("event")[0], data: JSON.parse(field("data").join("\n")) }];
  });
}

test("every recorded stream validates against the SSE schema", () => {
  const ajv = new Ajv2020();
  addFormats(ajv);
  ajv.addKeyword("discriminator");   // Pydantic's OpenAPI hint (with `mapping`, which Ajv can't use); `oneOf` validates
  const validate = ajv.compile(schema);
  const files = readdirSync(path.join(FIXTURES, "streams")).filter((f) => f.endsWith(".sse"));
  expect(files.sort()).toEqual(["error.sse", "no-passages.sse", "passages.sse"]);
  for (const file of files) {
    const all = events(readFileSync(path.join(FIXTURES, "streams", file), "utf8"));
    expect(all.length, file).toBeGreaterThan(0);
    expect(all.at(-1)?.event, `${file} ends with done`).toBe("done");
    for (const ev of all) expect(validate(ev), `${file}: ${ev.event} ${ajv.errorsText(validate.errors)}`).toBe(true);
  }
});
