import React from "react"

interface DictionaryLoadingOverlayProps {
  progress: number
  total: number
  isVisible: boolean
}

const DictionaryLoadingOverlay: React.FC<DictionaryLoadingOverlayProps> = ({
  progress,
  total,
  isVisible
}) => {
  if (!isVisible) return null

  const percentage = total > 0 ? Math.round((progress / total) * 100) : 0

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        zIndex: 999999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif"
      }}>
      <div
        style={{
          backgroundColor: "#FCD34D",
          borderRadius: "12px",
          padding: "32px 48px",
          maxWidth: "500px",
          width: "90%",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)"
        }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ fontSize: "48px", marginBottom: "8px" }}>📚</div>
          <h2
            style={{
              margin: 0,
              fontSize: "24px",
              fontWeight: "bold",
              color: "#000"
            }}>
            Loading Dictionary
          </h2>
          <p
            style={{
              margin: "8px 0 0 0",
              fontSize: "14px",
              color: "#666"
            }}>
            Setting up Japanese dictionary for the first time...
          </p>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            width: "100%",
            height: "12px",
            backgroundColor: "#000",
            borderRadius: "6px",
            overflow: "hidden",
            marginBottom: "12px"
          }}>
          <div
            style={{
              height: "100%",
              width: `${percentage}%`,
              backgroundColor: "#10B981",
              transition: "width 0.3s ease",
              borderRadius: "6px"
            }}
          />
        </div>

        {/* Progress Text */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "14px",
            color: "#000",
            fontWeight: "600"
          }}>
          <span>{percentage}%</span>
          <span>
            {progress.toLocaleString()} / {total.toLocaleString()} entries
          </span>
        </div>

        {/* Info Text */}
        <p
          style={{
            marginTop: "16px",
            fontSize: "12px",
            color: "#666",
            textAlign: "center"
          }}>
          This only happens once. Please wait...
        </p>
      </div>
    </div>
  )
}

export default DictionaryLoadingOverlay
