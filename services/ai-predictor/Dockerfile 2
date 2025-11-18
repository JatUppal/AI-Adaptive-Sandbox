# services/ai-predictor/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Faster, reproducible installs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Install deps first (layer cache)
COPY requirements.txt .
RUN python -m pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy app code
COPY . .

# Expose FastAPI default port inside container
ENV PORT=8000
EXPOSE 8000

# Run the API
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
