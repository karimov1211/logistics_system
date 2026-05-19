import React, { useState, useEffect, useRef } from 'react';

function App() {
  // Network and UI State
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [activePath, setActivePath] = useState([]);
  const [hoveredNode, setHoveredNode] = useState(null);
  
  // Form Selections
  const [startNode, setStartNode] = useState('');
  const [endNode, setEndNode] = useState('');
  const [linkSource, setLinkSource] = useState('');
  const [linkTarget, setLinkTarget] = useState('');
  const [linkWeight, setLinkWeight] = useState('');

  // Results & History
  const [routeResult, setRouteResult] = useState(null);
  const [commits, setCommits] = useState([]);
  const [committing, setCommitting] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState({ show: false, message: '', isSuccess: true });

  // Canvas & Animation refs
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const animProgressRef = useRef(0);
  const animPathRef = useRef([]);
  const isAnimatingRef = useRef(false);

  // Fetch initial data
  useEffect(() => {
    fetchNetwork();
    fetchGitHistory();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // Show toast utility
  const showToast = (message, isSuccess = true) => {
    setToast({ show: true, message, isSuccess });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 4000);
  };

  // Fetch network from backend
  const fetchNetwork = async () => {
    try {
      const res = await fetch('/api/network');
      const data = await res.json();
      setNodes(data.nodes || []);
      setLinks(data.links || []);
      
      // Auto-set dropdown defaults
      if (data.nodes && data.nodes.length > 0) {
        const sorted = [...data.nodes].sort((a, b) => a.name.localeCompare(b.name));
        setStartNode(sorted[0].id.toString());
        setEndNode(sorted[sorted.length - 1].id.toString());
        setLinkSource(sorted[0].id.toString());
        setLinkTarget(sorted[sorted.length - 1].id.toString());
      }
    } catch (err) {
      showToast("Tarmoq ma'lumotlarini yuklashda xatolik", false);
    }
  };

  // Fetch Git commits history
  const fetchGitHistory = async () => {
    try {
      const res = await fetch('/api/git/history');
      const data = await res.json();
      setCommits(data.commits || []);
    } catch (err) {
      console.error("Git log fetch failed", err);
    }
  };

  // Draw Map Loop (runs when state changes)
  useEffect(() => {
    drawMap();
  }, [nodes, links, activePath, hoveredNode]);

  // Canvas drawing logic
  const drawMap = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Helpers
    const isLinkInActivePath = (s, t) => {
      if (activePath.length < 2) return false;
      for (let i = 0; i < activePath.length - 1; i++) {
        const u = activePath[i].id;
        const v = activePath[i + 1].id;
        if ((u === s && v === t) || (u === t && v === s)) return true;
      }
      return false;
    };

    // 1. Draw links (connections)
    links.forEach(link => {
      const sourceNode = nodes.find(n => n.id === link.source);
      const targetNode = nodes.find(n => n.id === link.target);
      if (!sourceNode || !targetNode) return;

      const isPathSegment = isLinkInActivePath(link.source, link.target);

      ctx.beginPath();
      ctx.moveTo(sourceNode.x, sourceNode.y);
      ctx.lineTo(targetNode.x, targetNode.y);

      if (isPathSegment) {
        ctx.strokeStyle = '#10b981'; // var(--accent)
        ctx.lineWidth = 4;
        ctx.shadowColor = 'rgba(16, 185, 129, 0.35)';
        ctx.shadowBlur = 15;
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw weight (distance) circle
      const midX = (sourceNode.x + targetNode.x) / 2;
      const midY = (sourceNode.y + targetNode.y) / 2;

      ctx.beginPath();
      ctx.arc(midX, midY, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#060912';
      ctx.strokeStyle = isPathSegment ? '#10b981' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isPathSegment ? '#10b981' : '#64748b';
      ctx.font = '500 10px Outfit';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(link.weight, midX, midY);
    });

    // 2. Draw nodes (cities)
    nodes.forEach(node => {
      const isSelected = activePath.some(p => p.id === node.id);
      const isHovered = hoveredNode && hoveredNode.id === node.id;

      ctx.beginPath();
      ctx.arc(node.x, node.y, 16, 0, Math.PI * 2);

      if (isSelected) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(16, 185, 129, 0.35)';
        ctx.shadowBlur = 10;
      } else if (isHovered) {
        ctx.fillStyle = 'rgba(79, 70, 229, 0.2)';
        ctx.strokeStyle = '#4f46e5'; // var(--primary)
        ctx.lineWidth = 2;
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = '#0d1224';
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Inner core
      ctx.beginPath();
      ctx.arc(node.x, node.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#10b981' : (isHovered ? '#4f46e5' : 'rgba(255,255,255,0.4)');
      ctx.fill();

      // Node label
      ctx.font = isSelected ? '600 13px Outfit' : '500 13px Outfit';
      ctx.fillStyle = isSelected ? '#ffffff' : '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(node.name, node.x, node.y - 24);
    });

    // 3. Draw Cargo
    if (isAnimatingRef.current && animPathRef.current.length >= 2) {
      drawCargo(ctx);
    }
  };

  // Cargo drawing helper
  const drawCargo = (ctx) => {
    const animPath = animPathRef.current;
    const progress = animProgressRef.current;
    const totalSegments = animPath.length - 1;
    const scaledProgress = progress * totalSegments;
    const currentSegmentIndex = Math.floor(scaledProgress);

    let segmentProgress = 0;
    let nodeA, nodeB;

    if (currentSegmentIndex >= totalSegments) {
      nodeA = animPath[totalSegments - 1];
      nodeB = animPath[totalSegments];
      segmentProgress = 1;
    } else {
      nodeA = animPath[currentSegmentIndex];
      nodeB = animPath[currentSegmentIndex + 1];
      segmentProgress = scaledProgress - currentSegmentIndex;
    }

    const cargoX = nodeA.x + (nodeB.x - nodeA.x) * segmentProgress;
    const cargoY = nodeA.y + (nodeB.y - nodeA.y) * segmentProgress;

    ctx.beginPath();
    ctx.arc(cargoX, cargoY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = '12px Outfit';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📦', cargoX, cargoY);
  };

  // Start cargo animation loop
  const startCargoAnimation = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animProgressRef.current = 0;
    isAnimatingRef.current = true;

    const step = () => {
      animProgressRef.current += 0.005;
      if (animProgressRef.current > 1) {
        animProgressRef.current = 0; // loop
      }
      drawMap();
      animationRef.current = requestAnimationFrame(step);
    };
    animationRef.current = requestAnimationFrame(step);
  };

  // Canvas mouse interaction
  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    let found = null;
    nodes.forEach(node => {
      const dx = node.x - x;
      const dy = node.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 18) {
        found = node;
      }
    });

    if (hoveredNode?.id !== found?.id) {
      setHoveredNode(found);
      canvas.style.cursor = found ? 'pointer' : 'default';
    }
  };

  // Calculate shortest route path
  const handleCalculateRoute = async (e) => {
    e.preventDefault();
    if (startNode === endNode) {
      showToast("Chiqish va yetkazib berish manzili bir xil bo'lishi mumkin emas", false);
      return;
    }

    try {
      const res = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: startNode, end: endNode })
      });
      const result = await res.json();
      if (result.success) {
        setRouteResult(result);
        setActivePath(result.path);
        animPathRef.current = result.path;
        startCargoAnimation();
        showToast("Marshrut muvaffaqiyatli aniqlandi va chizildi");
      } else {
        showToast(result.message || "Marshrut hisoblashda xatolik", false);
      }
    } catch (err) {
      showToast("Server bilan bog'lanishda xatolik", false);
    }
  };

  // Version/Commit results
  const handleGitCommit = async () => {
    if (!routeResult) return;
    setCommitting(true);
    try {
      const res = await fetch('/api/version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: routeResult })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        setCommits(data.commits || []);
      } else {
        showToast("Git orqali versiyalash bajarilmadi", false);
      }
    } catch (err) {
      showToast("Aloqa xatosi", false);
    } finally {
      setCommitting(false);
    }
  };

  // Save/modify city link connection
  const handleSaveLink = async (e) => {
    e.preventDefault();
    const sourceId = parseInt(linkSource);
    const targetId = parseInt(linkTarget);
    const weight = parseInt(linkWeight);

    if (sourceId === targetId) {
      showToast("Manzillar bir xil bo'lishi mumkin emas", false);
      return;
    }

    // Find and update link, or add new
    let updatedLinks = [...links];
    let existingIndex = updatedLinks.findIndex(l => 
      (l.source === sourceId && l.target === targetId) || 
      (l.source === targetId && l.target === sourceId)
    );

    if (existingIndex > -1) {
      updatedLinks[existingIndex].weight = weight;
    } else {
      updatedLinks.push({ source: sourceId, target: targetId, weight });
    }

    try {
      const res = await fetch('/api/network/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, links: updatedLinks })
      });
      const data = await res.json();
      if (data.success) {
        showToast("Bog'lanish muvaffaqiyatli saqlandi!");
        setLinks(updatedLinks);
        
        // Reset calculations
        setActivePath([]);
        setRouteResult(null);
        isAnimatingRef.current = false;
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        setLinkWeight('');
      } else {
        showToast("Xatoni saqlab bo'lmadi", false);
      }
    } catch (err) {
      showToast("Aloqa xatosi", false);
    }
  };

  const sortedNodes = [...nodes].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="glow-bg-1"></div>
      <div className="glow-bg-2"></div>
      
      <div className="app-container">
        <header className="app-header">
          <div className="logo-area">
            <span className="logo-icon">🚚</span>
            <h1>LOGIX <span>NUMPY</span></h1>
          </div>
          <p className="subtitle">Logistika va yetkazib berish tizimi: NumPy yordamida eng qisqa marshrutlarni hisoblash va natijalarni Git orqali versiyalash</p>
        </header>

        <div className="main-layout">
          {/* Left panel: Controls and configuration */}
          <div className="sidebar-panel">
            <section className="glass-card router-controls">
              <div className="card-header">
                <span className="icon">📍</span>
                <h2>Marshrut Hisoblash</h2>
              </div>
              <form onSubmit={handleCalculateRoute}>
                <div className="form-group">
                  <label htmlFor="startNode">Chiqish punkti:</label>
                  <select 
                    id="startNode" 
                    value={startNode} 
                    onChange={e => setStartNode(e.target.value)} 
                    required
                  >
                    {sortedNodes.map(node => (
                      <option key={`start-${node.id}`} value={node.id}>{node.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="endNode">Yetkazib berish manzili:</label>
                  <select 
                    id="endNode" 
                    value={endNode} 
                    onChange={e => setEndNode(e.target.value)} 
                    required
                  >
                    {sortedNodes.map(node => (
                      <option key={`end-${node.id}`} value={node.id}>{node.name}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn-primary">
                  <span>Yo'nalishni Aniqlash</span>
                  <span className="btn-arrow">→</span>
                </button>
              </form>
            </section>

            <section className="glass-card results-card">
              <div className="card-header">
                <span className="icon">📊</span>
                <h2>Hisob-Kitob Natijalari</h2>
              </div>
              
              {!routeResult ? (
                <div className="results-placeholder">
                  Yo'nalishni hisoblash uchun yuqoridagi tugmani bosing.
                </div>
              ) : (
                <div className="results-content">
                  <div className="stats-grid">
                    <div className="stat-item">
                      <span className="stat-label">Masofa</span>
                      <span className="stat-value">{routeResult.distance} km</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Vaqt (O'rtacha)</span>
                      <span className="stat-value">{routeResult.duration}</span>
                    </div>
                  </div>
                  <div className="path-sequence">
                    <span className="path-label">Marshrut ketma-ketligi:</span>
                    <div className="path-flow">
                      {routeResult.path.map((node, idx) => (
                        <React.Fragment key={`path-n-${node.id}`}>
                          <span className="path-node">{node.name}</span>
                          {idx < routeResult.path.length - 1 && (
                            <span className="path-arrow">→</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  
                  <div className="versioning-zone">
                    <button 
                      type="button" 
                      onClick={handleGitCommit} 
                      className="btn-accent"
                      disabled={committing}
                    >
                      <span className="git-icon">🐙</span>
                      <span>{committing ? 'Saqlanmoqda...' : "Git-da versiyalash"}</span>
                    </button>
                  </div>
                </div>
              )}
            </section>
            
            <section className="glass-card network-editor">
              <div className="card-header">
                <span className="icon">⚙️</span>
                <h2>Tarmoqni Tahrirlash</h2>
              </div>
              <p className="section-desc">Yangi bog'lanish (yo'l) qo'shing yoki mavjud masofani o'zgartiring:</p>
              <form onSubmit={handleSaveLink}>
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="linkSource">A Shaxar:</label>
                    <select 
                      id="linkSource" 
                      value={linkSource} 
                      onChange={e => setLinkSource(e.target.value)} 
                      required
                    >
                      {sortedNodes.map(node => (
                        <option key={`src-${node.id}`} value={node.id}>{node.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="linkTarget">B Shaxar:</label>
                    <select 
                      id="linkTarget" 
                      value={linkTarget} 
                      onChange={e => setLinkTarget(e.target.value)} 
                      required
                    >
                      {sortedNodes.map(node => (
                        <option key={`tgt-${node.id}`} value={node.id}>{node.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="linkWeight">Masofa (km):</label>
                  <input 
                    type="number" 
                    id="linkWeight" 
                    min="1" 
                    max="2000" 
                    value={linkWeight}
                    onChange={e => setLinkWeight(e.target.value)}
                    required 
                    placeholder="Masofa masalan, 150"
                  />
                </div>
                <button type="submit" className="btn-secondary">Bog'lanishni saqlash</button>
              </form>
            </section>
          </div>

          {/* Right panel: Interactive map & Git Version log */}
          <div className="content-panel">
            <section className="glass-card map-card">
              <div className="card-header">
                <span className="icon">🗺️</span>
                <h2>Uzbekiston Logistika Xaritasi</h2>
                <span className="badge">{nodes.length} ta tugun faol</span>
              </div>
              <div className="canvas-container">
                <canvas 
                  ref={canvasRef} 
                  id="mapCanvas" 
                  width="950" 
                  height="650"
                  onMouseMove={handleMouseMove}
                />
                <div className="map-legend">
                  <span className="legend-item"><span className="dot hub"></span>Markaz / Shaxar</span>
                  <span className="legend-item"><span className="line path"></span>Eng qisqa yo'l</span>
                  <span className="legend-item"><span className="line standard"></span>Mavjud yo'llar</span>
                </div>
              </div>
            </section>

            <section className="glass-card git-log-card">
              <div className="card-header">
                <span className="icon">📁</span>
                <h2>GitHub Versiyalar Tarixi (Git Log)</h2>
                <span className="git-branch">🌿 main</span>
              </div>
              <div className="git-log-container">
                <div className="git-log-list">
                  {commits.length === 0 ? (
                    <div className="git-empty">Versiyalar tarixi yuklanmoqda...</div>
                  ) : (
                    commits.map((commit, idx) => (
                      <div className="git-commit-item" key={`commit-${commit.hash}-${idx}`}>
                        <span className="commit-hash">{commit.hash}</span>
                        <span className="commit-date">{commit.date}</span>
                        <span className="commit-msg" title={commit.subject}>{commit.subject}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Notification Toast */}
      <div id="toast" className={`toast ${toast.show ? 'show' : ''}`} style={{ borderColor: toast.isSuccess ? 'var(--accent)' : '#ef4444' }}>
        <span style={{ fontSize: '1.2rem' }}>{toast.isSuccess ? '✅' : '❌'}</span>
        <span>{toast.message}</span>
      </div>
    </>
  );
}

export default App;
