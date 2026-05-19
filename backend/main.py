from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import numpy as np
import uvicorn
import json
import os
import subprocess
from datetime import datetime
from dotenv import load_dotenv

from fastapi.middleware.cors import CORSMiddleware

# Setup base directory (robust pathing for Azure/local running)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Load environment variables from .env file
load_dotenv(dotenv_path=os.path.join(BASE_DIR, ".env"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("history", exist_ok=True)

# ─── Azure SQL Connection ────────────────────────────────────────────────────
DB_SERVER   = os.getenv("DB_SERVER", os.getenv("AZURE_SQL_SERVER", ""))
DB_NAME     = os.getenv("DB_NAME", os.getenv("AZURE_SQL_DATABASE", "logistics_db"))
DB_USER     = os.getenv("DB_USER", os.getenv("AZURE_SQL_USERNAME", ""))
DB_PASSWORD = os.getenv("DB_PASSWORD", os.getenv("AZURE_SQL_PASSWORD", ""))

def get_db_connection():
    """Return a pyodbc connection to Azure SQL Database."""
    import pyodbc
    conn_str = (
        f"DRIVER={{ODBC Driver 18 for SQL Server}};"
        f"SERVER={DB_SERVER};"
        f"DATABASE={DB_NAME};"
        f"UID={DB_USER};"
        f"PWD={DB_PASSWORD};"
        f"Encrypt=yes;"
        f"TrustServerCertificate=no;"
        f"Connection Timeout=30;"
    )
    return pyodbc.connect(conn_str)

def init_db():
    """Create tables if they don't exist."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # Network nodes table
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='nodes' AND xtype='U')
            CREATE TABLE nodes (
                id INT PRIMARY KEY,
                name NVARCHAR(100) NOT NULL,
                x FLOAT NOT NULL,
                y FLOAT NOT NULL
            )
        """)
        # Network links table
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='links' AND xtype='U')
            CREATE TABLE links (
                id INT IDENTITY(1,1) PRIMARY KEY,
                source_id INT NOT NULL,
                target_id INT NOT NULL,
                weight INT NOT NULL
            )
        """)
        # Route history table
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='route_history' AND xtype='U')
            CREATE TABLE route_history (
                id INT IDENTITY(1,1) PRIMARY KEY,
                timestamp NVARCHAR(30),
                start_city NVARCHAR(100),
                end_city NVARCHAR(100),
                distance FLOAT,
                duration NVARCHAR(50),
                path NVARCHAR(500)
            )
        """)
        conn.commit()
        conn.close()

        # Seed default data if nodes table is empty
        seed_default_data()
        print("[DB] Azure SQL DB initialized successfully.")
    except Exception as e:
        print(f"[DB] DB init error (running in fallback mode): {e}")

def seed_default_data():
    """Insert default nodes and links if tables are empty."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM nodes")
        count = cursor.fetchone()[0]
        if count == 0:
            default_nodes = [
                (0, "Toshkent",  680, 180),
                (1, "Samarqand", 480, 320),
                (2, "Buxoro",    350, 300),
                (3, "Xiva",      180, 230),
                (4, "Nukus",     100, 120),
                (5, "Qarshi",    440, 450),
                (6, "Termiz",    510, 550),
                (7, "Andijon",   880, 210),
                (8, "Namangan",  830, 160),
                (9, "Farg'ona",  840, 250),
            ]
            cursor.executemany(
                "INSERT INTO nodes (id, name, x, y) VALUES (?, ?, ?, ?)",
                default_nodes
            )
            default_links = [
                (0, 1, 300), (0, 8, 280), (0, 9, 320),
                (8, 7,  70), (7, 9,  80), (8, 9,  80),
                (1, 2, 270), (2, 3, 450), (3, 4, 170),
                (1, 5, 150), (5, 6, 280), (2, 5, 160),
            ]
            cursor.executemany(
                "INSERT INTO links (source_id, target_id, weight) VALUES (?, ?, ?)",
                default_links
            )
            conn.commit()
        conn.close()
    except Exception as e:
        print(f"[DB] Seed error: {e}")

# ─── Fallback (JSON) helpers ─────────────────────────────────────────────────
DEFAULT_NODES = [
    {"id": 0, "name": "Toshkent",  "x": 680, "y": 180},
    {"id": 1, "name": "Samarqand", "x": 480, "y": 320},
    {"id": 2, "name": "Buxoro",    "x": 350, "y": 300},
    {"id": 3, "name": "Xiva",      "x": 180, "y": 230},
    {"id": 4, "name": "Nukus",     "x": 100, "y": 120},
    {"id": 5, "name": "Qarshi",    "x": 440, "y": 450},
    {"id": 6, "name": "Termiz",    "x": 510, "y": 550},
    {"id": 7, "name": "Andijon",   "x": 880, "y": 210},
    {"id": 8, "name": "Namangan",  "x": 830, "y": 160},
    {"id": 9, "name": "Farg'ona",  "x": 840, "y": 250},
]
DEFAULT_LINKS = [
    {"source": 0, "target": 1, "weight": 300},
    {"source": 0, "target": 8, "weight": 280},
    {"source": 0, "target": 9, "weight": 320},
    {"source": 8, "target": 7, "weight":  70},
    {"source": 7, "target": 9, "weight":  80},
    {"source": 8, "target": 9, "weight":  80},
    {"source": 1, "target": 2, "weight": 270},
    {"source": 2, "target": 3, "weight": 450},
    {"source": 3, "target": 4, "weight": 170},
    {"source": 1, "target": 5, "weight": 150},
    {"source": 5, "target": 6, "weight": 280},
    {"source": 2, "target": 5, "weight": 160},
]
CONFIG_FILE  = os.path.join(BASE_DIR, "backend", "history", "network_config.json")
HISTORY_FILE = os.path.join(BASE_DIR, "backend", "history", "route_log.json")

def load_network_fallback():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"nodes": DEFAULT_NODES, "links": DEFAULT_LINKS}

def save_network_fallback(nodes, links):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump({"nodes": nodes, "links": links}, f, ensure_ascii=False, indent=4)

# ─── Network data helpers (DB preferred, JSON fallback) ──────────────────────
def load_network():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, x, y FROM nodes")
        nodes = [{"id": r[0], "name": r[1], "x": r[2], "y": r[3]} for r in cursor.fetchall()]
        cursor.execute("SELECT source_id, target_id, weight FROM links")
        links = [{"source": r[0], "target": r[1], "weight": r[2]} for r in cursor.fetchall()]
        conn.close()
        return {"nodes": nodes, "links": links}
    except Exception:
        return load_network_fallback()

def save_network(nodes, links):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM links")
        cursor.execute("DELETE FROM nodes")
        for n in nodes:
            cursor.execute(
                "INSERT INTO nodes (id, name, x, y) VALUES (?, ?, ?, ?)",
                (n["id"], n["name"], n["x"], n["y"])
            )
        for l in links:
            cursor.execute(
                "INSERT INTO links (source_id, target_id, weight) VALUES (?, ?, ?)",
                (l["source"], l["target"], l["weight"])
            )
        conn.commit()
        conn.close()
    except Exception:
        save_network_fallback(nodes, links)

# ─── Git helpers ─────────────────────────────────────────────────────────────
def run_git_command(args):
    try:
        result = subprocess.run(
            args, cwd="..",
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        return f"Error: {e.stderr.strip()}"
    except Exception as e:
        return f"Exception: {str(e)}"

def init_git():
    if not os.path.exists("../.git"):
        run_git_command(["git", "init"])
        run_git_command(["git", "config", "user.name",  os.getenv("GIT_USER_NAME",  "Logistika Agent")])
        run_git_command(["git", "config", "user.email", os.getenv("GIT_USER_EMAIL", "logistika@tizim.local")])

# ─── NumPy Dijkstra ───────────────────────────────────────────────────────────
def dijkstra_numpy(adj_matrix, start_node):
    n = adj_matrix.shape[0]
    distances    = np.full(n, np.inf)
    distances[start_node] = 0
    visited      = np.zeros(n, dtype=bool)
    predecessors = np.full(n, -1, dtype=int)
    for _ in range(n):
        tmp = np.copy(distances)
        tmp[visited] = np.inf
        u = int(np.argmin(tmp))
        if tmp[u] == np.inf:
            break
        visited[u] = True
        for v in range(n):
            w = adj_matrix[u, v]
            if w > 0 and w != np.inf and not visited[v]:
                nd = distances[u] + w
                if nd < distances[v]:
                    distances[v] = nd
                    predecessors[v] = u
    return distances, predecessors

def reconstruct_path(predecessors, start, end):
    path, curr = [], end
    while curr != -1:
        path.append(curr)
        if curr == start:
            break
        curr = predecessors[curr]
    if not path or path[-1] != start:
        return []
    return path[::-1]

# ─── Startup ──────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    init_git()
    init_db()

# Mount React production assets
frontend_dist = os.path.join(BASE_DIR, "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

@app.get("/{catchall:path}")
async def serve_spa(catchall: str):
    if catchall.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")
    
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    return JSONResponse({"status": "success", "message": "Logistics API is running (Fallback mode)"})

@app.get("/api/network")
async def get_network():
    return JSONResponse(load_network())

@app.post("/api/calculate")
async def calculate_route(data: dict):
    try:
        start_id = int(data.get("start"))
        end_id   = int(data.get("end"))

        network  = load_network()
        nodes    = network["nodes"]
        links    = network["links"]

        id_to_idx  = {n["id"]: i for i, n in enumerate(nodes)}
        idx_to_node = {i: n for i, n in enumerate(nodes)}
        num_nodes  = len(nodes)

        if start_id not in id_to_idx or end_id not in id_to_idx:
            raise HTTPException(status_code=400, detail="Tugun topilmadi.")

        start_idx = id_to_idx[start_id]
        end_idx   = id_to_idx[end_id]

        adj = np.full((num_nodes, num_nodes), np.inf)
        np.fill_diagonal(adj, 0)
        for lnk in links:
            s = id_to_idx.get(lnk["source"])
            t = id_to_idx.get(lnk["target"])
            if s is not None and t is not None:
                adj[s, t] = lnk["weight"]
                adj[t, s] = lnk["weight"]

        distances, predecessors = dijkstra_numpy(adj, start_idx)
        dist = distances[end_idx]
        if dist == np.inf:
            return JSONResponse({"success": False,
                                  "message": "Yo'l topilmadi."})

        path_idx   = reconstruct_path(predecessors, start_idx, end_idx)
        path_nodes = [idx_to_node[i] for i in path_idx]

        hours = dist / 70.0
        duration_str = f"{int(hours)} soat {int((hours % 1) * 60)} daqiqa"

        return JSONResponse({
            "success":  True,
            "start":    idx_to_node[start_idx],
            "end":      idx_to_node[end_idx],
            "distance": float(dist),
            "duration": duration_str,
            "path":     path_nodes,
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/network/update")
async def update_network(data: dict):
    try:
        nodes = data.get("nodes")
        links = data.get("links")
        if not nodes or not links:
            raise HTTPException(status_code=400, detail="Noto'g'ri format")
        save_network(nodes, links)
        return JSONResponse({"success": True, "message": "Tarmoq yangilandi"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/version")
async def version_results(data: dict):
    try:
        route_data = data.get("route")
        if not route_data:
            raise HTTPException(status_code=400, detail="Ma'lumot bo'sh")

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        start_name = route_data.get("start", {}).get("name", "")
        end_name   = route_data.get("end",   {}).get("name", "")
        distance   = route_data.get("distance", 0)
        duration   = route_data.get("duration", "")
        path_str   = " -> ".join([p["name"] for p in route_data.get("path", [])])

        # Save to Azure SQL
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO route_history (timestamp, start_city, end_city, distance, duration, path) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (timestamp, start_name, end_name, distance, duration, path_str)
            )
            conn.commit()
            conn.close()
        except Exception as db_err:
            print(f"DB write error (using JSON fallback): {db_err}")
            # JSON fallback
            logs = []
            if os.path.exists(HISTORY_FILE):
                try:
                    with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                        logs = json.load(f)
                except Exception:
                    pass
            logs.append({"timestamp": timestamp, "start": start_name, "end": end_name,
                         "distance": distance, "duration": duration, "path": path_str})
            with open(HISTORY_FILE, "w", encoding="utf-8") as f:
                json.dump(logs, f, ensure_ascii=False, indent=4)

        # Git commit
        run_git_command(["git", "add", "-A"])
        commit_msg = f"Route: {start_name} -> {end_name} ({distance} km) [{timestamp}]"
        git_res    = run_git_command(["git", "commit", "-m", commit_msg])

        git_log = run_git_command(["git", "log", "-n", "8",
                                   "--pretty=format:%h|%ad|%s", "--date=short"])
        commits = []
        if "Error:" not in git_log and git_log.strip():
            for line in git_log.split("\n"):
                if "|" in line:
                    h, ad, s = line.split("|", 2)
                    commits.append({"hash": h, "date": ad, "subject": s})

        return JSONResponse({
            "success":    True,
            "message":    "Natijalar Azure SQL va Git'ga saqlandi!",
            "git_output": git_res,
            "commits":    commits,
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/git/history")
async def get_git_history():
    git_log = run_git_command(["git", "log", "-n", "10",
                               "--pretty=format:%h|%ad|%s", "--date=short"])
    commits = []
    if "Error:" not in git_log and git_log.strip():
        for line in git_log.split("\n"):
            if "|" in line:
                h, ad, s = line.split("|", 2)
                commits.append({"hash": h, "date": ad, "subject": s})
    return JSONResponse({"commits": commits})

if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host=host, port=port)
