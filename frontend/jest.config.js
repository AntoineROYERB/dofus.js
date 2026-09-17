/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  testEnvironment: "node",
  // The phone layout's logic lives in plain modules so it can be tested
  // without a DOM; `npm test -- --coverage` (as CI runs it) keeps it covered.
  coverageThreshold: {
    "./src/utils/spellArc.ts": { lines: 95, branches: 80 },
    "./src/utils/lineUp.ts": { lines: 95, branches: 80 },
    "./src/utils/touchConfirm.ts": { lines: 95, branches: 80 },
    "./src/utils/boardFit.ts": { lines: 95, branches: 80 },
    "./src/lib/native.ts": { lines: 95, branches: 80 },
  },
  transform: {
    "^.+\.tsx?$": ["ts-jest",{}],
  },
};