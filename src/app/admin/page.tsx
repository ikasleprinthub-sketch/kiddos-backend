"use client";

import { useState } from "react";

export default function AdminDashboard() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleDownloadImages = async () => {
    try {
      setIsDownloading(true);
      setError(null);
      setSuccess(false);

      const response = await fetch("/api/admin/downloads/images");

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to download images");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `images-${new Date().toISOString().split("T")[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to download images");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div style={{ padding: "40px", maxWidth: "600px", margin: "0 auto", fontFamily: "system-ui" }}>
      <h1>Admin Dashboard</h1>

      <div style={{ marginTop: "30px", padding: "20px", border: "1px solid #e0e0e0", borderRadius: "8px" }}>
        <h2>Download Images</h2>
        <p style={{ color: "#666", marginBottom: "20px" }}>
          Download all uploaded images from products, categories, and banners as a ZIP file.
        </p>

        <button
          onClick={handleDownloadImages}
          disabled={isDownloading}
          style={{
            padding: "10px 20px",
            backgroundColor: isDownloading ? "#ccc" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isDownloading ? "not-allowed" : "pointer",
            fontSize: "16px",
          }}
        >
          {isDownloading ? "Downloading..." : "Download Images"}
        </button>

        {error && (
          <div style={{ marginTop: "15px", padding: "10px", backgroundColor: "#f8d7da", color: "#721c24", borderRadius: "4px" }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ marginTop: "15px", padding: "10px", backgroundColor: "#d4edda", color: "#155724", borderRadius: "4px" }}>
            Images downloaded successfully!
          </div>
        )}
      </div>
    </div>
  );
}
