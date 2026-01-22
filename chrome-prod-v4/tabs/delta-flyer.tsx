import PageLayout from '~components/PageLayout'

function DeltaFlyerPage() {
  return (
    <PageLayout>
      <div className="df-bg">
        <div className="df-container">
          {/* Header */}
          <div className="df-card df-card-lg mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">🚀 Delta Flyer</h1>
            <p className="text-xl text-blue-200">
              Special features and advanced controls for Bundai extension
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-2 gap-6">
            {/* Advanced Settings */}
            <div className="df-card">
              <h2 className="text-2xl font-bold text-white mb-4">⚙️ Advanced Settings</h2>
              <p className="text-blue-200 mb-4">
                Configure advanced extension behaviors and performance optimizations.
              </p>
              <button className="df-btn df-btn-blue">
                Open Settings
              </button>
            </div>

            {/* Debug Tools */}
            <div className="df-card">
              <h2 className="text-2xl font-bold text-white mb-4">🔧 Debug Tools</h2>
              <p className="text-blue-200 mb-4">
                Developer tools for debugging subtitle extraction and API calls.
              </p>
              <button className="df-btn df-btn-purple">
                Open Debugger
              </button>
            </div>

            {/* Analytics */}
            <div className="df-card">
              <h2 className="text-2xl font-bold text-white mb-4">📊 Analytics</h2>
              <p className="text-blue-200 mb-4">
                View your learning progress and subtitle usage statistics.
              </p>
              <button className="df-btn df-btn-green">
                View Stats
              </button>
            </div>

            {/* Experimental Features */}
            <div className="df-card">
              <h2 className="text-2xl font-bold text-white mb-4">🧪 Experimental</h2>
              <p className="text-blue-200 mb-4">
                Try out cutting-edge features in development.
              </p>
              <button className="df-btn df-btn-red">
                Enable Beta
              </button>
            </div>
          </div>

          {/* Info Section */}
          <div className="df-card mt-8">
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