import PageLayout from '~components/PageLayout'

function DeltaFlyerPage() {
  return (
    <PageLayout>
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-8 mb-8 border border-white/20">
            <h1 className="text-4xl font-bold text-white mb-4">🚀 Delta Flyer</h1>
            <p className="text-xl text-blue-200">
              Special features and advanced controls for Bundai extension
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Advanced Settings */}
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4">⚙️ Advanced Settings</h2>
              <p className="text-blue-200 mb-4">
                Configure advanced extension behaviors and performance optimizations.
              </p>
              <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors">
                Open Settings
              </button>
            </div>

            {/* Debug Tools */}
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4">🔧 Debug Tools</h2>
              <p className="text-blue-200 mb-4">
                Developer tools for debugging subtitle extraction and API calls.
              </p>
              <button className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition-colors">
                Open Debugger
              </button>
            </div>

            {/* Analytics */}
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4">📊 Analytics</h2>
              <p className="text-blue-200 mb-4">
                View your learning progress and subtitle usage statistics.
              </p>
              <button className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-colors">
                View Stats
              </button>
            </div>

            {/* Experimental Features */}
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4">🧪 Experimental</h2>
              <p className="text-blue-200 mb-4">
                Try out cutting-edge features in development.
              </p>
              <button className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors">
                Enable Beta
              </button>
            </div>
          </div>

          {/* Info Section */}
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mt-8 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-4">ℹ️ About Delta Flyer</h2>
            <p className="text-blue-200 leading-relaxed">
              The Delta Flyer is a special interface for advanced users of the Bundai extension. 
              It provides access to experimental features, detailed analytics, and developer tools 
              that aren't available in the standard popup interface.
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}

export default DeltaFlyerPage