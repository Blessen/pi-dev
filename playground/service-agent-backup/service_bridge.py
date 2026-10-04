import sys
import json
import asyncio
import os
from pathlib import Path

# Add the parlant directory to sys.path
PARLANT_DIR = Path("/home/administrator/designbytes/DA_BT_279_SALES_AGENT/ka-backend/playground/parlant_multi_turn")
sys.path.insert(0, str(PARLANT_DIR))

from env_loader import load_app_env
load_app_env()

from service_assistant.customer_asset.customer_asset_service import resolve_asset_details
from service_assistant.sr.sr_repo import SrRepository
from service_assistant.spn_fmi.spn_fmi_repository import SpnFmiRepository
from service_assistant.mssql_db import MSSQLDBManager
from service_assistant.rag.rag_repository import RagRepository
from qdrant_client import AsyncQdrantClient

async def handle_resolve_asset(identifier, id_type, app_code):
    try:
        details = await resolve_asset_details(identifier, id_type, app_code)
        return details or {}
    except Exception as e:
        return {"error": str(e)}

async def handle_get_recent_srs(instance_id, count):
    try:
        repo = SrRepository()
        srs = await repo.get_recent_srs(instance_id, count=count)
        return srs or []
    except Exception as e:
        return {"error": str(e)}

async def handle_lookup_sr(sr_number):
    try:
        repo = SrRepository()
        sr = await repo.find_sr_by_number(sr_number)
        return sr or {}
    except Exception as e:
        return {"error": str(e)}

async def handle_search_symptom(symptom_text, app_code=""):
    qdrant_url = os.getenv("QDRANT_URL", "http://10.3.2.63:6333")
    qdrant = AsyncQdrantClient(url=qdrant_url, timeout=30.0, check_compatibility=False)
    repo = RagRepository(qdrant)
    try:
        res = await repo.search_prioritized(query=symptom_text, app_code=app_code or "")
        return res or {}
    except Exception as e:
        return {"error": str(e)}

async def handle_spn_fmi(spn, fmi, app_code=""):
    qdrant_url = os.getenv("QDRANT_URL", "http://10.3.2.63:6333")
    qdrant = AsyncQdrantClient(url=qdrant_url, timeout=15.0, check_compatibility=False)
    repo = SpnFmiRepository(qdrant)
    try:
        doc = await repo.get_spn_fmi_document(spn=str(spn), fmi=str(fmi), app_code=app_code or "")
        return doc or {}
    except Exception as e:
        return {"error": str(e)}

async def handle_wiring_diagram(app_code):
    try:
        query = "SELECT TOP 1 * FROM dbo.tbl_WiringDiagramMaster WHERE cAPPLICATION_CODE = %s"
        row = await MSSQLDBManager.fetch_one(query, (app_code,))
        return row or {}
    except Exception as e:
        return {"error": str(e)}

async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command provided"}))
        return

    cmd = sys.argv[1]
    if cmd == "resolve_asset":
        identifier = sys.argv[2] if len(sys.argv) > 2 else ""
        id_type = sys.argv[3] if len(sys.argv) > 3 else "Instance Id"
        app_code = sys.argv[4] if len(sys.argv) > 4 else None
        res = await handle_resolve_asset(identifier, id_type, app_code)
        print(json.dumps(res, default=str))
    elif cmd == "recent_srs":
        instance_id = sys.argv[2] if len(sys.argv) > 2 else ""
        count = int(sys.argv[3]) if len(sys.argv) > 3 else 3
        res = await handle_get_recent_srs(instance_id, count)
        print(json.dumps(res, default=str))
    elif cmd == "lookup_sr":
        sr_number = sys.argv[2] if len(sys.argv) > 2 else ""
        res = await handle_lookup_sr(sr_number)
        print(json.dumps(res, default=str))
    elif cmd == "search_symptom":
        symptom_text = sys.argv[2] if len(sys.argv) > 2 else "black smoke"
        app_code = sys.argv[3] if len(sys.argv) > 3 else ""
        res = await handle_search_symptom(symptom_text, app_code)
        print(json.dumps(res, default=str))
    elif cmd == "spn_fmi":
        spn = sys.argv[2] if len(sys.argv) > 2 else "3216"
        fmi = sys.argv[3] if len(sys.argv) > 3 else "9"
        app_code = sys.argv[4] if len(sys.argv) > 4 else ""
        res = await handle_spn_fmi(spn, fmi, app_code)
        print(json.dumps(res, default=str))
    elif cmd == "wiring_diagram":
        app_code = sys.argv[2] if len(sys.argv) > 2 else ""
        res = await handle_wiring_diagram(app_code)
        print(json.dumps(res, default=str))
    else:
        print(json.dumps({"error": f"Unknown command {cmd}"}))

if __name__ == "__main__":
    asyncio.run(main())
