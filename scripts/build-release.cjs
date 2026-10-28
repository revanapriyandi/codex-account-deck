const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), os = require("node:os");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."), git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const runtime = JSON.parse(fs.readFileSync(path.join(root, "build/runtime.json"), "utf8"));
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
(async () => {
  if (git("status", "--porcelain")) throw Error("Commit source changes before building a release");
  const commit = git("rev-parse", "HEAD"), out = path.join(root, "dist");
  fs.mkdirSync(out, { recursive: true });
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "deck-payload-"));
  const payload = path.join(stage, "payload");
  fs.mkdirSync(payload);
  for (const name of ["Install.ps1", "Launch.ps1", "Uninstall.ps1", "Start-Hidden.vbs", "README.md", "LICENSE", "package.json"])
    fs.copyFileSync(path.join(root, name), path.join(payload, name));
  fs.cpSync(path.join(root, "src"), path.join(payload, "src"), {
    recursive: true,
    filter: (file) => !/\.(exe|dll)$/i.test(file),
  });
  fs.mkdirSync(path.join(payload, "scripts"));
  fs.copyFileSync(path.join(root, "scripts/Build-CredentialHost.ps1"), path.join(payload, "scripts/Build-CredentialHost.ps1"));
  const response = await fetch(runtime.url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw Error("Official Node.js runtime download failed: " + response.status);
  const archive = Buffer.from(await response.arrayBuffer());
  if (digest(archive) !== runtime.sha256) throw Error("Official Node.js archive checksum mismatch");
  const archivePath = path.join(stage, "node.zip");
  fs.writeFileSync(archivePath, archive);
  execFileSync("python3", ["-c", "import zipfile,sys,pathlib; z=zipfile.ZipFile(sys.argv[1]); out=pathlib.Path(sys.argv[2]); out.mkdir(); prefix=sys.argv[3]; [(out/name).write_bytes(z.read(prefix+'/'+name)) for name in ['node.exe','LICENSE']]", archivePath, path.join(payload, "runtime"), "node-v" + runtime.version + "-win-x64"]);
  const filename = `${pkg.name}-v${pkg.version}-setup.exe`, file = path.join(out, filename);
  const compiler = process.env.DECK_MAKENSIS ?? "makensis";
  const compilerVersion = execFileSync(compiler, ["-VERSION"], { encoding: "utf8" }).trim();
  execFileSync(compiler, ["-V2", "-DVERSION=" + pkg.version, "-DPAYLOAD=" + payload, "-DOUTPUT=" + file, path.join(root, "build/installer.nsi")], { cwd: root, stdio: "inherit" });
  const sha256 = digest(fs.readFileSync(file));
  const report = { name: pkg.name, version: pkg.version, commit, platform: process.platform, arch: process.arch, node: process.versions.node, createdAt: new Date().toISOString(), artifact: filename, sha256, compiler: compilerVersion, bundledNode: runtime, unsigned: true, windowsRuntimeTestedByThisBuild: false };
  fs.writeFileSync(path.join(out, "build-report.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(out, "SHA256SUMS.txt"), sha256 + "  " + filename + "\n");
  console.log(JSON.stringify(report));
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
