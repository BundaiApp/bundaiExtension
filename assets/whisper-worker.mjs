let currentModel = null
let currentTranscriber = null
let initialized = false

let pipelineFn = null
let envObj = null

self.onmessage = async (event) => {
  const { type, id, payload } = event.data || {}

  try {
    if (type === "init") {
      const wasmBase = payload?.wasmBase
      if (!wasmBase) {
        throw new Error("Missing wasmBase for worker init")
      }

      const runtimeModule = await import("./transformers/transformers.web.js")
      pipelineFn = runtimeModule.pipeline
      envObj = runtimeModule.env

      if (!pipelineFn || !envObj) {
        throw new Error("Transformers runtime did not expose pipeline/env")
      }

      envObj.allowLocalModels = false
      envObj.useBrowserCache = true
      envObj.wasm = envObj.wasm || {}
      envObj.wasm.wasmPaths = wasmBase
      envObj.wasm.proxy = false
      envObj.wasm.simd = true

      if (envObj.backends?.onnx?.wasm) {
        envObj.backends.onnx.wasm.wasmPaths = wasmBase
        envObj.backends.onnx.wasm.proxy = false
      }

      initialized = true
      self.postMessage({ type: "init:ok", id })
      return
    }

    if (type === "transcribe") {
      if (!initialized || !pipelineFn) {
        throw new Error("Worker not initialized")
      }

      const model = payload?.model
      const options = payload?.options || {}
      const audioBuffer = payload?.audioBuffer

      if (!model || !audioBuffer) {
        throw new Error("Missing model or audioBuffer")
      }

      if (!currentTranscriber || currentModel !== model) {
        currentTranscriber = await pipelineFn(
          "automatic-speech-recognition",
          model
        )
        currentModel = model
      }

      const audio = new Float32Array(audioBuffer)
      const output = await currentTranscriber(audio, options)
      self.postMessage({ type: "transcribe:ok", id, payload: output })
      return
    }

    throw new Error(`Unknown worker message type: ${type}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error"
    self.postMessage({ type: "error", id, error: message })
  }
}
