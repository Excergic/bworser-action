# Production Dockerfile for StudyBuddy backend (FastAPI + RAG)
# For Vercel you use serverless (api/index.py); use this for self-hosted or Docker deploy.
FROM python:3.12-slim

WORKDIR /app

# Non-root user
RUN adduser --disabled-password --gecos "" appuser

# Install dependencies from committed requirements.txt (regenerate with: uv export --no-dev --no-hashes -o requirements.txt)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY main.py ./
COPY api/ api/
COPY rag/ rag/

USER appuser

EXPOSE 8000

ENV PYTHONUNBUFFERED=1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
