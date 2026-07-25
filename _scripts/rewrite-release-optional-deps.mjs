// @ts-check
/**
 * Rewrites the main release package's optionalDependencies from version ranges
 * to GitHub Release asset URLs, then repacks the main tarball.
 *
 * Usage:
 *   node _scripts/rewrite-release-optional-deps.mjs \
 *     --repo ColinMelendez/typescript-go \
 *     --tag v7.1.0-dev.20260724.1 \
 *     [--built-npm built/npm]
 */
import { $ } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
        repo: { type: "string" },
        tag: { type: "string" },
        "built-npm": { type: "string", default: "built/npm" },
    },
    strict: true,
});

if (!values.repo || !values.tag) {
    console.error("Usage: node _scripts/rewrite-release-optional-deps.mjs --repo OWNER/REPO --tag TAG [--built-npm built/npm]");
    process.exit(1);
}

const builtNpm = path.resolve(values["built-npm"]);
const manifestPath = path.join(builtNpm, "publish-manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

const mainStage = manifest.stages?.[1];
if (!Array.isArray(mainStage) || mainStage.length !== 1) {
    throw new Error(`Unexpected publish-manifest stages; expected stages[1] to list the main package tarball.`);
}

const mainTarballName = mainStage[0].filename;
if (typeof mainTarballName !== "string" || !mainTarballName.endsWith(".tgz")) {
    throw new Error(`Unexpected main tarball filename: ${mainTarballName}`);
}

const mainPackageDirName = mainTarballName.slice(0, -".tgz".length);
const mainPackageDir = path.join(builtNpm, mainPackageDirName);
const mainPackageJsonPath = path.join(mainPackageDir, "package.json");
const packageJson = JSON.parse(await fs.readFile(mainPackageJsonPath, "utf8"));

const optionalDependencies = packageJson.optionalDependencies;
if (!optionalDependencies || typeof optionalDependencies !== "object") {
    throw new Error(`${mainPackageJsonPath} has no optionalDependencies to rewrite.`);
}

const assetBase = `https://github.com/${values.repo}/releases/download/${values.tag}`;
/** @type {Record<string, string>} */
const rewritten = {};

for (const [depName, previous] of Object.entries(optionalDependencies)) {
    // @typescript/typescript-darwin-arm64 -> typescript-darwin-arm64.tgz
    const slash = depName.lastIndexOf("/");
    const assetName = `${slash === -1 ? depName : depName.slice(slash + 1)}.tgz`;
    const assetPath = path.join(builtNpm, assetName);
    try {
        await fs.access(assetPath);
    } catch {
        throw new Error(`Missing platform tarball for ${depName}: ${assetPath}`);
    }
    rewritten[depName] = `${assetBase}/${assetName}`;
    console.log(`${depName}: ${previous} -> ${rewritten[depName]}`);
}

packageJson.optionalDependencies = rewritten;
packageJson.repository = {
    type: "git",
    url: `https://github.com/${values.repo}.git`,
};
delete packageJson.publishConfig;

await fs.writeFile(mainPackageJsonPath, JSON.stringify(packageJson, undefined, 4) + "\n");

// Pack by explicit path so npm does not resolve a registry package named "typescript".
const packSpec = `./${mainPackageDirName}`;
const { stdout } = await $({ cwd: builtNpm })`npm pack --json ${packSpec}`;
const packedName = JSON.parse(stdout)[0].filename.replace("@", "").replace("/", "-");
const packedPath = path.join(builtNpm, packedName);
const targetPath = path.join(builtNpm, mainTarballName);
if (path.resolve(packedPath) !== path.resolve(targetPath)) {
    await fs.rename(packedPath, targetPath);
}

// Sanity-check the packed tarball actually contains our rewritten optionalDependencies.
const { stdout: packedJsonStdout } = await $({ cwd: builtNpm })`tar -xOf ${mainTarballName} package/package.json`;
const packedJson = JSON.parse(packedJsonStdout);
const sampleDep = Object.values(packedJson.optionalDependencies ?? {})[0];
if (typeof sampleDep !== "string" || !sampleDep.startsWith(`https://github.com/${values.repo}/releases/download/${values.tag}/`)) {
    throw new Error(
        `Packed ${mainTarballName} does not contain rewritten Release URLs ` +
            `(got optionalDependency value: ${JSON.stringify(sampleDep)}). ` +
            `Refusing to publish a broken main package.`,
    );
}

console.log(`Rewrote optionalDependencies and repacked ${mainTarballName}`);
console.log(`Install with:`);
console.log(`  npm install -D ${assetBase}/${mainTarballName}`);
