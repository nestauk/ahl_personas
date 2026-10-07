.PHONY: backend frontend ingest dev

backend:
	uv run uvicorn food_policy_impact_tool.api:app --reload --port 8010

frontend:
	cd frontend && npm run dev

ingest:
	uv run python -m food_policy_impact_tool.evidence.ingest

dev:
	$(MAKE) -j2 backend frontend
