from fastapi import FastAPI
import os

app = FastAPI(title="notification-service")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/notify")
async def notify(payload: dict):
    # Placeholder: integrate with SMTP provider or external service
    print("Notification payload:", payload)
    return {"status": "queued"}
