FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./

ENV SCHEDULER_HOST=0.0.0.0 \
    SCHEDULER_PORT=8000

EXPOSE 8000

CMD ["python", "app.py"]
