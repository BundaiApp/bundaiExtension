import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()

const transformersSrc = path.join(
  ROOT,
  "node_modules/@huggingface/transformers/dist/transformers.web.js"
)
const ortWasmMinSrc = path.join(
  ROOT,
  "node_modules/.pnpm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/node_modules/onnxruntime-web/dist/ort.wasm.min.mjs"
)
const ortThreadedMjsSrc = path.join(
  ROOT,
  "node_modules/.pnpm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs"
)
const ortThreadedJsepMjsSrc = path.join(
  ROOT,
  "node_modules/.pnpm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs"
)
const ortThreadedWasmSrc = path.join(
  ROOT,
  "node_modules/.pnpm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm"
)
const ortThreadedJsepWasmSrc = path.join(
  ROOT,
  "node_modules/.pnpm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm"
)

const transformersOutDir = path.join(ROOT, "assets/transformers")
const onnxOutDir = path.join(ROOT, "assets/onnxruntime")

for (const dir of [transformersOutDir, onnxOutDir]) {
  fs.mkdirSync(dir, { recursive: true })
}

if (!fs.existsSync(transformersSrc)) {
  throw new Error(`Missing transformers source: ${transformersSrc}`)
}
if (!fs.existsSync(ortWasmMinSrc)) {
  throw new Error(`Missing ORT wasm source: ${ortWasmMinSrc}`)
}

const transformersRaw = fs.readFileSync(transformersSrc, "utf8")
const transformersPatched = transformersRaw
  .replace(
    'import * as __WEBPACK_EXTERNAL_MODULE_onnxruntime_common_82b39e9f__ from "onnxruntime-common";',
    'import * as __WEBPACK_EXTERNAL_MODULE_onnxruntime_common_82b39e9f__ from "./onnxruntime-common-shim.mjs";'
  )
  .replace(
    'import * as __WEBPACK_EXTERNAL_MODULE_onnxruntime_web_74d14b94__ from "onnxruntime-web";',
    'import * as __WEBPACK_EXTERNAL_MODULE_onnxruntime_web_74d14b94__ from "./onnxruntime-web-shim.mjs";'
  )

fs.writeFileSync(
  path.join(transformersOutDir, "transformers.web.js"),
  transformersPatched,
  "utf8"
)

const shimContent = `export * from "../onnxruntime/ort.wasm.min.mjs";\nimport ort from "../onnxruntime/ort.wasm.min.mjs";\nexport default ort;\n`
fs.writeFileSync(
  path.join(transformersOutDir, "onnxruntime-common-shim.mjs"),
  shimContent,
  "utf8"
)
fs.writeFileSync(
  path.join(transformersOutDir, "onnxruntime-web-shim.mjs"),
  shimContent,
  "utf8"
)

for (const [src, outName] of [
  [ortWasmMinSrc, "ort.wasm.min.mjs"],
  [ortThreadedMjsSrc, "ort-wasm-simd-threaded.mjs"],
  [ortThreadedJsepMjsSrc, "ort-wasm-simd-threaded.jsep.mjs"],
  [ortThreadedWasmSrc, "ort-wasm-simd-threaded.wasm"],
  [ortThreadedJsepWasmSrc, "ort-wasm-simd-threaded.jsep.wasm"]
]) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing required runtime file: ${src}`)
  }
  fs.copyFileSync(src, path.join(onnxOutDir, outName))
}

console.log("[prepare-browser-whisper-runtime] Runtime assets prepared")
