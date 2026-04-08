import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const frameworkRoot = path.resolve(repoRoot, '..', 'framework');
const vendorRoot = path.resolve(__dirname, 'vendor', 'framework');
const vendorDistDir = path.join(vendorRoot, 'dist');
const vendorNativeRoot = path.join(vendorRoot, 'src', 'native');
const vendorTargetDir = path.join(vendorNativeRoot, 'target');

function platformBinaryInfo() {
  const { platform, arch } = process;
  const suffixMap = {
    'darwin-arm64': { suffix: 'darwin-arm64', library: 'libmni_framework_native.dylib' },
    'darwin-x64': { suffix: 'darwin-x64', library: 'libmni_framework_native.dylib' },
    'linux-x64': { suffix: 'linux-x64-gnu', library: 'libmni_framework_native.so' },
    'linux-arm64': { suffix: 'linux-arm64-gnu', library: 'libmni_framework_native.so' },
    'win32-x64': { suffix: 'win32-x64-msvc', library: 'mni_framework_native.dll' },
  };

  const info = suffixMap[`${platform}-${arch}`];
  if (!info) {
    throw new Error(`Unsupported platform for vendored framework build: ${platform}-${arch}`);
  }
  return info;
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyNativeBinary() {
  const { suffix, library } = platformBinaryInfo();
  const builtLibraryPath = path.join(vendorTargetDir, 'release', library);
  const nodeBinaryPath = path.join(vendorNativeRoot, `mni-framework-native.${suffix}.node`);

  if (!fs.existsSync(builtLibraryPath)) {
    throw new Error(`Expected native library at ${builtLibraryPath}`);
  }

  fs.copyFileSync(builtLibraryPath, nodeBinaryPath);
}

function buildTypescriptShim() {
  ensureDirectory(vendorDistDir);

  const sourceFiles = [
    'index.ts',
    'tensor.ts',
    'module.ts',
    'nn.ts',
    'optimizer.ts',
  ];

  sourceFiles.forEach((fileName) => {
    const sourcePath = path.join(frameworkRoot, 'src', fileName);
    const destinationPath = path.join(vendorDistDir, fileName.replace(/\.ts$/, '.js'));
    const source = fs.readFileSync(sourcePath, 'utf8');
    const transformed = stripTypeScriptTypes(source);
    fs.writeFileSync(destinationPath, transformed);
  });
}

function buildNativeAddon() {
  ensureDirectory(vendorNativeRoot);

  execFileSync('cargo', [
    'build',
    '--manifest-path', path.join(frameworkRoot, 'src', 'native', 'Cargo.toml'),
    '--release',
    '--features', 'cpu',
    '--target-dir', vendorTargetDir,
  ], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

function writeManifest() {
  const manifestPath = path.join(vendorRoot, 'build-info.json');
  const payload = {
    builtAt: new Date().toISOString(),
    source: frameworkRoot,
    platform: process.platform,
    arch: process.arch,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);
}

buildTypescriptShim();
buildNativeAddon();
copyNativeBinary();
writeManifest();
