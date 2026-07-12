/**
 * M0 unit tests for the pure comparison helpers (docs/data-core-cure-plan.md).
 * Run: node --experimental-strip-types scripts/db-core.test.ts
 */
import { diffValues, reconcileSets } from "../app/lib/server/db/diff.ts";

let failures = 0;
function expectEqual(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    console.error(`✗ ${label}\n    actual:   ${a}\n    expected: ${b}`);
  } else {
    console.log(`✓ ${label}`);
  }
}

// ---- diffValues -------------------------------------------------------------
expectEqual("identical objects → no diff", diffValues({ a: 1, b: "x" }, { a: 1, b: "x" }), []);
expectEqual(
  "changed leaf is reported with path",
  diffValues({ a: { b: 2 } }, { a: { b: 3 } }),
  [{ path: "a.b", legacy: 2, table: 3 }],
);
expectEqual("null vs undefined are equal (JSONB round-trip)", diffValues({ a: null }, {}), []);
expectEqual("cent tolerance on numbers", diffValues({ v: 10.004 }, { v: 10.0 }), []);
expectEqual(
  "beyond cent tolerance is a diff",
  diffValues({ v: 10.02 }, { v: 10.0 }),
  [{ path: "v", legacy: 10.02, table: 10.0 }],
);
expectEqual(
  "array position diff",
  diffValues([1, 2, 3], [1, 9, 3]),
  [{ path: "[1]", legacy: 2, table: 9 }],
);
expectEqual(
  "missing key on table side",
  diffValues({ a: 1, b: 2 }, { a: 1 }),
  [{ path: "b", legacy: 2, table: undefined }],
);
expectEqual("diff limit caps output", diffValues(
  Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i])),
  Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i + 1])),
).length, 20);

// ---- reconcileSets ----------------------------------------------------------
expectEqual(
  "id set reconciliation",
  reconcileSets(["a", "b", "c"], ["b", "c", "d"]),
  { missingInTable: ["a"], extraInTable: ["d"], common: 2 },
);
expectEqual(
  "clean sets",
  reconcileSets(["a"], ["a"]),
  { missingInTable: [], extraInTable: [], common: 1 },
);

if (failures > 0) {
  console.error(`db-core tests: ${failures} failure(s)`);
  process.exit(1);
}
console.log("db-core tests: all passed");
