import os
from pinecone import Pinecone, ServerlessSpec
from langchain_pinecone import PineconeVectorStore
from langchain_openai import OpenAIEmbeddings
from langchain_core.documents import Document

# Dimensions for OpenAI embedding models
_DIMS = {"text-embedding-3-small": 1536, "text-embedding-3-large": 3072, "text-embedding-ada-002": 1536}


class VectorStore:
    def __init__(self):
        embedding_model = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
        self.embeddings = OpenAIEmbeddings(model=embedding_model)

        pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
        index_name = os.environ.get("PINECONE_INDEX", "studybuddy")

        # Create index if it doesn't exist
        existing = [i.name for i in pc.list_indexes()]
        if index_name not in existing:
            pc.create_index(
                name=index_name,
                dimension=_DIMS.get(embedding_model, 1536),
                metric="cosine",
                spec=ServerlessSpec(
                    cloud=os.environ.get("PINECONE_CLOUD", "aws"),
                    region=os.environ.get("PINECONE_REGION", "us-east-1"),
                ),
            )
            print(f"Created Pinecone index '{index_name}'")

        self.index = pc.Index(index_name)
        self.store = PineconeVectorStore(index=self.index, embedding=self.embeddings)

    def add(self, docs: list[Document]) -> int:
        self.store.add_documents(docs)
        return len(docs)

    def search(self, query: str, k: int = 5, topic: str | None = None) -> list[Document]:
        filter_ = {"topic": {"$eq": topic}} if topic else None
        return self.store.similarity_search(query, k=k, filter=filter_)

    def get_stats(self) -> dict:
        stats = self.index.describe_index_stats()
        total = stats.total_vector_count

        # Pinecone doesn't store metadata globally — derive topics from namespace keys
        # We store all docs in the default namespace; return what we know from env/config
        namespaces = list(stats.namespaces.keys()) if stats.namespaces else []

        return {
            "total_documents": total,
            "topics": namespaces if namespaces else ["(default namespace)"],
            "sources": [],   # Pinecone doesn't expose metadata without querying
        }

    def clear(self):
        """Delete all vectors from the index."""
        self.index.delete(delete_all=True)
