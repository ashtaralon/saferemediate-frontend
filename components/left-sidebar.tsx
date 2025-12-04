"use client"

export function LeftSidebar() {
  return (
    <aside className="left-sidebar">
      <div className="sidebar-section">
        <h3 className="sidebar-title">System Info</h3>
        <div className="info-item">
          <span className="info-label">Environment</span>
          <span className="info-value">Production</span>
        </div>
        <div className="info-item">
          <span className="info-label">Region</span>
          <span className="info-value">us-east-1</span>
        </div>
        <div className="info-item">
          <span className="info-label">Provider</span>
          <span className="info-value">AWS</span>
        </div>
      </div>

      <div className="sidebar-section">
        <h3 className="sidebar-title">Severity Counts</h3>
        <div className="severity-item critical">
          <span className="severity-label">Critical</span>
          <span className="severity-count">7</span>
        </div>
        <div className="severity-item high">
          <span className="severity-label">High</span>
          <span className="severity-count">19</span>
        </div>
        <div className="severity-item medium">
          <span className="severity-label">Medium</span>
          <span className="severity-count">42</span>
        </div>
        <div className="severity-item low">
          <span className="severity-label">Low</span>
          <span className="severity-count">88</span>
        </div>
        <div className="severity-item healthy">
          <span className="severity-label">Healthy</span>
          <span className="severity-count">1,204</span>
        </div>
      </div>

      <div className="sidebar-section">
        <h3 className="sidebar-title">Resource Types</h3>
        <div className="resource-item">
          <span className="resource-label">Compute</span>
          <span className="resource-count">412</span>
        </div>
        <div className="resource-item">
          <span className="resource-label">Network</span>
          <span className="resource-count">167</span>
        </div>
        <div className="resource-item">
          <span className="resource-label">Data</span>
          <span className="resource-count">220</span>
        </div>
        <div className="resource-item">
          <span className="resource-label">Storage</span>
          <span className="resource-count">156</span>
        </div>
        <div className="resource-item">
          <span className="resource-label">Identity</span>
          <span className="resource-count">98</span>
        </div>
        <div className="resource-item">
          <span className="resource-label">Security</span>
          <span className="resource-count">74</span>
        </div>
      </div>

      <style jsx>{`
        .left-sidebar {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        
        .sidebar-section {
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 20px;
        }
        
        .sidebar-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 16px;
        }
        
        .info-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid var(--border-subtle);
        }
        
        .info-item:last-child {
          border-bottom: none;
        }
        
        .info-label {
          font-size: 13px;
          color: var(--text-secondary);
        }
        
        .info-value {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }
        
        .severity-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          border-radius: 6px;
          margin-bottom: 8px;
          transition: all 150ms ease;
        }
        
        .severity-item:last-child {
          margin-bottom: 0;
        }
        
        .severity-item:hover {
          background: var(--bg-tertiary);
        }
        
        .severity-item.critical {
          border-left: 3px solid var(--critical);
        }
        
        .severity-item.high {
          border-left: 3px solid var(--high);
        }
        
        .severity-item.medium {
          border-left: 3px solid var(--medium);
        }
        
        .severity-item.low {
          border-left: 3px solid var(--low);
        }
        
        .severity-item.healthy {
          border-left: 3px solid var(--success);
        }
        
        .severity-label {
          font-size: 14px;
          color: var(--text-primary);
        }
        
        .severity-count {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
        }
        
        .resource-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
        }
        
        .resource-label {
          font-size: 14px;
          color: var(--text-secondary);
        }
        
        .resource-count {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }
      `}</style>
    </aside>
  )
}
