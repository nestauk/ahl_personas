.PHONY: backend frontend ingest dev

backend:
	uv run uvicorn food_policy_impact_tool.api:app --reload --port 8000

frontend:
	cd frontend && npm run dev

ingest:
	uv run python -m food_policy_impact_tool.evidence.ingest

dev:
	@echo "Starting backend and frontend — run in separate terminals or use:"
	@echo "  make backend  (terminal 1)"
	@echo "  make frontend (terminal 2)"
	@echo ""
	@echo "Or run both in the background:"
	$(MAKE) backend & $(MAKE) frontend & wait
