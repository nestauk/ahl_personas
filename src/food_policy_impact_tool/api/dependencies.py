from food_policy_impact_tool.evidence.retriever import HybridRetriever
from food_policy_impact_tool.evidence.store import EvidenceStore

_store: EvidenceStore | None = None
_retriever: HybridRetriever | None = None


def init_retriever() -> None:
    global _store, _retriever
    _store = EvidenceStore()
    _retriever = HybridRetriever(_store)


def get_store() -> EvidenceStore:
    if _store is None:
        raise RuntimeError("Store not initialised — has the app started up?")
    return _store


def get_retriever() -> HybridRetriever:
    if _retriever is None:
        raise RuntimeError("Retriever not initialised — has the app started up?")
    return _retriever


def shutdown_retriever() -> None:
    global _store, _retriever
    if _store:
        _store.close()
    _store = None
    _retriever = None
