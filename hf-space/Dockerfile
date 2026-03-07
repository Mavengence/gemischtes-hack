FROM python:3.11-slim

# HF Spaces runs containers as UID 1000
RUN useradd -m -u 1000 user

WORKDIR /app

# Install dependencies (sentence-transformers pulls torch automatically)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Set cache dir accessible to UID 1000
ENV HF_HOME=/home/user/.cache/huggingface

COPY app.py .
RUN chown -R user:user /app /home/user

USER user

EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
