console.log('BetterPortal NPM Post Install Script');

const fs = require("fs");
const path = require("path");

const cwd = process.env.INIT_CWD || process.cwd();
const BPSDK_UI_DIR = path.join(
  cwd,
  "./node_modules/@bettercorp/service-base-plugin-betterportal"
);

const packageJsonFile = path.join(cwd, "./package.json");
let packageJSON = JSON.parse(fs.readFileSync(packageJsonFile).toString());

if (packageJSON.name === "@bettercorp/service-base-plugin-betterportal") return;
console.log('BetterPortal NPM Post Install Script : Run install/update');

const uiDir = path.join(cwd, "./ui");
if (!fs.existsSync(uiDir)) fs.mkdirSync(uiDir);

const uiSrcDir = path.join(uiDir, "./src");
if (!fs.existsSync(uiSrcDir)) fs.mkdirSync(uiSrcDir);

for (let file of fs.readdirSync(BPSDK_UI_DIR, { withFileTypes: true })) {
  if (file.isDirectory()) continue;
  fs.copyFileSync(
    path.join(BPSDK_UI_DIR, file.name),
    path.join(uiDir, file.name)
  );
}

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

fs.writeFileSync(packageJsonFile, JSON.stringify(packageJSON, [" "], 2));
