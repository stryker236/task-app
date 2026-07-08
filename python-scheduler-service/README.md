# Python Scheduler Service

Small HTTP service for Advisor calendar scheduling. It uses Google OR-Tools CP-SAT to place eligible tasks into future work slots.

## Setup

```bash
python -m pip install -r requirements.txt
```

## Run

```bash
python app.py
```

Defaults:

- Host: `127.0.0.1`
- Port: `8000`
- Health: `GET /health`
- Schedule: `POST /schedule`

The Node backend reads `SCHEDULER_SERVICE_URL`; if unset, it uses `http://127.0.0.1:8000`.

## Test

```bash
python -m unittest discover -s . -p "test_*.py"
```
