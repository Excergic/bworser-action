from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document


class DocumentProcessor:
    def __init__(self, chunk_size: int = 800, chunk_overlap: int = 150):
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

    def process(self, text: str, source: str, topic: str) -> list[Document]:
        """Split text into chunks, attaching source + topic metadata."""
        doc = Document(
            page_content=text,
            metadata={"source": source, "topic": topic},
        )
        chunks = self.splitter.split_documents([doc])
        for i, chunk in enumerate(chunks):
            chunk.metadata["chunk_index"] = i
        return chunks
