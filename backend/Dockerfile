# ── Backend Dockerfile ──────────────────────────────────────────
# Use a slim Python 3.12 base image
FROM python:3.12-slim

# Set working directory inside the container
WORKDIR /app

# Copy requirements first (for caching — if requirements don't change,
# Docker won't re-install packages on every build)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy all backend source files into the container
COPY app.py .
COPY data_fetcher.py .
COPY fetch_data.py .
COPY database.py .

# Copy the model package and data
COPY model/ ./model/
COPY data/ ./data/

# Expose port 8000 so the frontend can talk to it
EXPOSE 8000

# Start the FastAPI backend when the container runs
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
