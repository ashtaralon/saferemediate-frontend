"use client"

interface FindingCardProps {
  severity: "critical" | "high" | "medium" | "low"
  icon: string
  title: string
  impact: string
  confidence: number
  isNew: boolean
  findingId: string
  onSimulateFix?: (findingId: string) => void
}

export function FindingCard({ severity, icon, title, impact, confidence, isNew, findingId, onSimulateFix }: FindingCardProps) {
  const getSeverityColor = () => {
    switch (severity) {
      case "critical":
        return "var(--critical)"
      case "high":
        return "var(--high)"
      case "medium":
        return "var(--medium)"
      case "low":
        return "var(--low)"
    }
  }

  const borderColor = getSeverityColor()

  return (
    <article className="finding-card">
      <div className="finding-header">
        <span className="finding-icon">{icon}</span>
        <h3 className="finding-title">{title}</h3>
        {isNew && <span className="badge-new">NEW</span>}
      </div>

      <div className="finding-impact">
        <span className="impact-label">Impact:</span>
        <span className="impact-text">{impact}</span>
      </div>

      <div className="confidence-badge">
        <span>✓</span>
        <span>SAFE TO FIX • {confidence}% confidence</span>
      </div>

      <div className="finding-actions">
        <button 
          className="btn-simulate"
          onClick={() => onSimulateFix?.(findingId)}
        >
          ▶ SIMULATE FIX
        </button>
        <button className="btn-details">DETAILS</button>
        <button className="btn-more">⋮</button>
      </div>

      <style jsx>{`
        .finding-card {
          background: var(--bg-secondary);
          border-left: 4px solid ${borderColor};
          border-radius: 12px;
          padding: 24px;
          box-shadow: var(--shadow-sm);
          transition: all 200ms ease-out;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .finding-card:hover {
          box-shadow: var(--shadow-lg);
          transform: translateY(-2px);
        }
        
        .finding-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        
        .finding-icon {
          font-size: 20px;
          flex-shrink: 0;
        }
        
        .finding-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          flex: 1;
          line-height: 1.4;
        }
        
        .badge-new {
          background: var(--medium);
          color: var(--bg-primary);
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          flex-shrink: 0;
        }
        
        .finding-impact {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .impact-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .impact-text {
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        
        .confidence-badge {
          background: rgba(16, 185, 129, 0.15);
          color: var(--success);
          border: 1px solid rgba(16, 185, 129, 0.3);
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          align-self: flex-start;
        }
        
        .finding-actions {
          display: flex;
          gap: 12px;
        }
        
        .btn-simulate {
          flex: 1;
          background: var(--action-primary);
          color: white;
          border: none;
          padding: 12px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          transition: all 150ms ease;
        }
        
        .btn-simulate:hover {
          background: var(--action-hover);
          box-shadow: var(--shadow-lg);
        }
        
        .btn-details {
          background: transparent;
          color: var(--text-secondary);
          border: 1px solid var(--border-default);
          padding: 12px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          text-transform: uppercase;
          transition: all 150ms ease;
        }
        
        .btn-details:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }
        
        .btn-more {
          background: transparent;
          color: var(--text-secondary);
          border: 1px solid var(--border-default);
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 18px;
          cursor: pointer;
          transition: all 150ms ease;
        }
        
        .btn-more:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }
      `}</style>
    </article>
  )
}
