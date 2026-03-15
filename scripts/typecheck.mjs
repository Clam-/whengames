import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const tempTsconfigPath = ".typecheck.tsconfig.json";

run("./node_modules/.bin/next", ["typegen"]);

const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
tsconfig.include = (tsconfig.include ?? []).filter(
  (entry) => entry !== ".next/types/**/*.ts" && entry !== ".next/dev/types/**/*.ts"
);

writeFileSync(tempTsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);

try {
  run("./node_modules/.bin/tsc", ["--noEmit", "-p", tempTsconfigPath]);
} finally {
  rmSync(tempTsconfigPath, { force: true });
}
