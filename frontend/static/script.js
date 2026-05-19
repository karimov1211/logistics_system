// Global variables for network state
let nodes = [];
let links = [];
let activePath = [];
let hoveredNode = null;

// Cargo Animation State
let animProgress = 0;
let animPath = [];
let isAnimating = false;
let animRequest = null;

// Canvas details
const canvas = document.getElementById('mapCanvas');
const ctx = canvas.getContext('2d');

// DOM Elements
const startNodeSelect = document.getElementById('startNode');
const endNodeSelect = document.getElementById('endNode');
const linkSourceSelect = document.getElementById('linkSource');
const linkTargetSelect = document.getElementById('linkTarget');
const routeForm = document.getElementById('routeForm');
const linkForm = document.getElementById('linkForm');
const resultsPlaceholder = document.getElementById('resultsPlaceholder');
const resultsContent = document.getElementById('resultsContent');
const resDistance = document.getElementById('resDistance');
const resDuration = document.getElementById('resDuration');
const resPathFlow = document.getElementById('resPathFlow');
const btnGitCommit = document.getElementById('btnGitCommit');
const gitCommitsList = document.getElementById('gitCommitsList');
const networkStatus = document.getElementById('networkStatus');

// Store current route calculation result
let currentRouteResult = null;

// Fetch initial data
window.addEventListener('DOMContentLoaded', async () => {
    await fetchNetwork();
    await fetchGitHistory();
});

// Toast notification function
function showToast(message, isSuccess = true) {
    const toast = document.getElementById('toast');
    toast.innerHTML = `<span style="font-size: 1.2rem;">${isSuccess ? '✅' : '❌'}</span> <span>${message}</span>`;
    toast.style.borderColor = isSuccess ? 'var(--accent)' : '#ef4444';
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// Fetch network structure
async function fetchNetwork() {
    try {
        const response = await fetch('/api/network');
        const data = await response.json();
        nodes = data.nodes;
        links = data.links;
        
        networkStatus.textContent = `${nodes.length} ta tugun faol`;
        
        populateDropdowns();
        drawMap();
    } catch (error) {
        showToast("Tarmoq ma'lumotlarini yuklashda xatolik yuz berdi", false);
    }
}

// Populate select lists
function populateDropdowns() {
    // Save selected values to preserve selections
    const prevStart = startNodeSelect.value;
    const prevEnd = endNodeSelect.value;
    const prevSrc = linkSourceSelect.value;
    const prevTgt = linkTargetSelect.value;
    
    // Clear
    startNodeSelect.innerHTML = '';
    endNodeSelect.innerHTML = '';
    linkSourceSelect.innerHTML = '';
    linkTargetSelect.innerHTML = '';
    
    // Sort nodes alphabetically for dropdown comfort
    const sortedNodes = [...nodes].sort((a, b) => a.name.localeCompare(b.name));
    
    sortedNodes.forEach(node => {
        const opt1 = new Option(node.name, node.id);
        const opt2 = new Option(node.name, node.id);
        const opt3 = new Option(node.name, node.id);
        const opt4 = new Option(node.name, node.id);
        
        startNodeSelect.add(opt1);
        endNodeSelect.add(opt2);
        linkSourceSelect.add(opt3);
        linkTargetSelect.add(opt4);
    });
    
    // Restore selections
    if (prevStart) startNodeSelect.value = prevStart;
    if (prevEnd) endNodeSelect.value = prevEnd;
    if (prevSrc) linkSourceSelect.value = prevSrc;
    if (prevTgt) linkTargetSelect.value = prevTgt;
}

// Draw the Map Canvas
function drawMap() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 1. Draw connections (links)
    links.forEach(link => {
        const sourceNode = nodes.find(n => n.id === link.source);
        const targetNode = nodes.find(n => n.id === link.target);
        
        if (!sourceNode || !targetNode) return;
        
        // Check if this link is part of the active shortest path
        const isPathSegment = isLinkInActivePath(link.source, link.target);
        
        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        
        if (isPathSegment) {
            ctx.strokeStyle = 'var(--accent)';
            ctx.lineWidth = 4;
            ctx.shadowColor = 'var(--accent-glow)';
            ctx.shadowBlur = 15;
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 2;
            ctx.shadowBlur = 0;
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
        
        // Draw distance tag at middle of link
        const midX = (sourceNode.x + targetNode.x) / 2;
        const midY = (sourceNode.y + targetNode.y) / 2;
        
        ctx.beginPath();
        ctx.arc(midX, midY, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#060912';
        ctx.strokeStyle = isPathSegment ? 'var(--accent)' : 'rgba(255,255,255,0.08)';
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
        
        // Node outer circle (glowing)
        ctx.beginPath();
        ctx.arc(node.x, node.y, 16, 0, Math.PI * 2);
        if (isSelected) {
            ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
            ctx.strokeStyle = 'var(--accent)';
            ctx.lineWidth = 2;
            ctx.shadowColor = 'var(--accent-glow)';
            ctx.shadowBlur = 10;
        } else if (isHovered) {
            ctx.fillStyle = 'rgba(79, 70, 229, 0.2)';
            ctx.strokeStyle = 'var(--primary)';
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
        
        // Node inner core
        ctx.beginPath();
        ctx.arc(node.x, node.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? 'var(--accent)' : (isHovered ? 'var(--primary)' : 'rgba(255,255,255,0.4)');
        ctx.fill();
        
        // Node text label
        ctx.font = isSelected ? '600 13px Outfit' : '500 13px Outfit';
        ctx.fillStyle = isSelected ? '#ffffff' : '#94a3b8';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, node.x, node.y - 24);
    });
    
    // 3. Draw Cargo Animation
    if (isAnimating && animPath.length >= 2) {
        drawCargo();
    }
}

function isLinkInActivePath(s, t) {
    if (activePath.length < 2) return false;
    for (let i = 0; i < activePath.length - 1; i++) {
        const u = activePath[i].id;
        const v = activePath[i+1].id;
        if ((u === s && v === t) || (u === t && v === s)) {
            return true;
        }
    }
    return false;
}

// Draw cargo vehicle animation along path
function drawCargo() {
    const totalSegments = animPath.length - 1;
    const scaledProgress = animProgress * totalSegments;
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
    
    // Interpolated coordinates
    const cargoX = nodeA.x + (nodeB.x - nodeA.x) * segmentProgress;
    const cargoY = nodeA.y + (nodeB.y - nodeA.y) * segmentProgress;
    
    // Draw delivery dot
    ctx.beginPath();
    ctx.arc(cargoX, cargoY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Draw truck/shipment emoji overlay
    ctx.font = '12px Outfit';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📦', cargoX, cargoY);
}

// Animation loop
function startCargoAnimation() {
    if (animRequest) cancelAnimationFrame(animRequest);
    animProgress = 0;
    isAnimating = true;
    
    function step() {
        animProgress += 0.005; // speed
        if (animProgress > 1) {
            animProgress = 0; // loop
        }
        drawMap();
        animRequest = requestAnimationFrame(step);
    }
    animRequest = requestAnimationFrame(step);
}

// Handle Route Form submission
routeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const start = startNodeSelect.value;
    const end = endNodeSelect.value;
    
    if (start === end) {
        showToast("Chiqish va yetkazib berish manzili bir xil bo'lishi mumkin emas", false);
        return;
    }
    
    try {
        const response = await fetch('/api/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start, end })
        });
        const result = await response.json();
        
        if (result.success) {
            currentRouteResult = result;
            activePath = result.path;
            
            // Show stats
            resDistance.textContent = `${result.distance} km`;
            resDuration.textContent = result.duration;
            
            // Build flow arrow list
            resPathFlow.innerHTML = '';
            result.path.forEach((node, idx) => {
                const nodeEl = document.createElement('span');
                nodeEl.className = 'path-node';
                nodeEl.textContent = node.name;
                resPathFlow.appendChild(nodeEl);
                
                if (idx < result.path.length - 1) {
                    const arrowEl = document.createElement('span');
                    arrowEl.className = 'path-arrow';
                    arrowEl.textContent = '→';
                    resPathFlow.appendChild(arrowEl);
                }
            });
            
            resultsPlaceholder.style.display = 'none';
            resultsContent.style.display = 'block';
            
            // Trigger animation
            animPath = result.path;
            startCargoAnimation();
            
            showToast("Marshrut muvaffaqiyatli aniqlandi va chizildi");
        } else {
            showToast(result.message || "Marshrut hisoblashda xatolik", false);
        }
    } catch (error) {
        showToast("Server bilan bog'lanishda xatolik yuz berdi", false);
    }
});

// Git Commit / Version execution
btnGitCommit.addEventListener('click', async () => {
    if (!currentRouteResult) return;
    
    try {
        btnGitCommit.disabled = true;
        btnGitCommit.innerHTML = '<span>Saqlanmoqda...</span>';
        
        const response = await fetch('/api/version', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ route: currentRouteResult })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(data.message);
            updateGitLogView(data.commits);
        } else {
            showToast("Git orqali versiyalash bajarilmadi", false);
        }
    } catch (error) {
        showToast("Aloqa xatosi", false);
    } finally {
        btnGitCommit.disabled = false;
        btnGitCommit.innerHTML = '<span class="git-icon">🐙</span> <span>Git-da versiyalash</span>';
    }
});

// Populate and Update Git Commit Logs
function updateGitLogView(commits) {
    gitCommitsList.innerHTML = '';
    
    if (!commits || commits.length === 0) {
        gitCommitsList.innerHTML = '<div class="git-empty">Hozircha versiyalar mavjud emas.</div>';
        return;
    }
    
    commits.forEach(commit => {
        const item = document.createElement('div');
        item.className = 'git-commit-item';
        item.innerHTML = `
            <span class="commit-hash">${commit.hash}</span>
            <span class="commit-date">${commit.date}</span>
            <span class="commit-msg" title="${commit.subject}">${commit.subject}</span>
        `;
        gitCommitsList.appendChild(item);
    });
}

// Fetch general Git log
async function fetchGitHistory() {
    try {
        const response = await fetch('/api/git/history');
        const data = await response.json();
        updateGitLogView(data.commits);
    } catch (e) {
        console.error("Git log fetch failed", e);
    }
}

// Handle Add/Modify Links
linkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const source = parseInt(linkSourceSelect.value);
    const target = parseInt(linkTargetSelect.value);
    const weight = parseInt(document.getElementById('linkWeight').value);
    
    if (source === target) {
        showToast("Manzillar bir xil bo'lishi mumkin emas", false);
        return;
    }
    
    // Find if link exists
    let existingLink = links.find(l => 
        (l.source === source && l.target === target) || 
        (l.source === target && l.target === source)
    );
    
    if (existingLink) {
        existingLink.weight = weight;
    } else {
        links.push({ source, target, weight });
    }
    
    try {
        const response = await fetch('/api/network/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodes, links })
        });
        const data = await response.json();
        if (data.success) {
            showToast("Bog'lanish muvaffaqiyatli saqlandi!");
            drawMap();
            // Clear route calculation as network structure changed
            activePath = [];
            isAnimating = false;
            if (animRequest) cancelAnimationFrame(animRequest);
            resultsPlaceholder.style.display = 'block';
            resultsContent.style.display = 'none';
            document.getElementById('linkWeight').value = '';
        } else {
            showToast("Xatoni saqlab bo'lmadi", false);
        }
    } catch (error) {
        showToast("Aloqa xatosi", false);
    }
});

// Canvas node hovering interaction
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    // Account for CSS scaling of canvas
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
    
    if (hoveredNode !== found) {
        hoveredNode = found;
        canvas.style.cursor = found ? 'pointer' : 'default';
        drawMap();
    }
});
