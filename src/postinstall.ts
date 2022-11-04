import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join } from "path";

const cwd = process.cwd();
const BPSDK_UI_DIR = join(
  cwd,
  "./node_modules/@bettercorp/service-base-plugin-betterportal"
);

const uiDir = join(cwd, "./ui");
if (!existsSync(uiDir)) mkdirSync(uiDir);

const uiSrcDir = join(uiDir, "./src");
if (!existsSync(uiSrcDir)) mkdirSync(uiSrcDir);

for (let file of readdirSync(BPSDK_UI_DIR, { withFileTypes: true })) {
  if (file.isDirectory()) continue;
  copyFileSync(join(BPSDK_UI_DIR, file.name), join(uiDir, file.name));
}

const packageJsonFile = join(cwd, "./package.json");
let packageJSON = JSON.parse(readFileSync(packageJsonFile).toString());

packageJSON.scripts = packageJSON.scripts || {};
packageJSON.scripts.build = "tsc";
packageJSON.scripts.dev =
  "nodemon --config node_modules/@bettercorp/service-base/development/nodemon.json";
packageJSON.scripts.start =
  "ts-node node_modules/@bettercorp/service-base/lib/cli.js";
packageJSON.scripts["build-ui"] = "cd ui; npm ci; npm run build; cd ../";

packageJSON.files = packageJSON.files || [];
if (packageJSON.files.indexOf("lib/**/*") >= 0)
  packageJSON.files.push("lib/**/*");
if (packageJSON.files.indexOf("bpui/**/*") >= 0)
  packageJSON.files.push("bpui/**/*");

writeFileSync(packageJsonFile, JSON.stringify(packageJSON, [" "], 2));
