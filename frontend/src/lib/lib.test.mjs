// Run: node --test src/lib/*.test.mjs  (Node 22.18+ strips the .ts types).
// .mjs keeps the `.ts` import extensions out of tsconfig's reach.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_OPEN, splitByH3 } from "./markdown-sections.ts";
import { parseSuggestedAnswers } from "./spec-helpers.ts";

test("splitByH3 keeps preamble and splits on ### only", () => {
  const md = "**Net:** mixed.\n\n### Who is impacted\nA\n#### sub\nB\n### Benefits and harms\nC";
  assert.deepEqual(
    splitByH3(md).map((b) => b.heading),
    ["", "Who is impacted", "Benefits and harms"],
  );
  assert.match(splitByH3(md)[1].body, /#### sub/);
  assert.equal(splitByH3("### Only\nx")[0].heading, "Only");
  assert.ok(DEFAULT_OPEN.test("Benefits and harms"));
  assert.ok(!DEFAULT_OPEN.test("Also worth noting"));
});

test("parseSuggestedAnswers", () => {
  assert.deepEqual(
    parseSuggestedAnswers('Hi\n<suggested_answers>["a","b","c"]</suggested_answers>'),
    ["a", "b", "c"],
  );
  assert.deepEqual(parseSuggestedAnswers("<suggested_answers>[oops</suggested_answers>"), []);
  assert.deepEqual(parseSuggestedAnswers("none"), []);
});
