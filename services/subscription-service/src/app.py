from fastapi import FastAPI, HTTPException
import os

app = FastAPI(title="subscription-service")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/plans")
async def get_plans():
    # Mock plans, replace with DB queries
    plans = [
        {"id": "basic", "name": "Básico", "price_usd": 5},
        {"id": "standard", "name": "Estándar", "price_usd": 8},
        {"id": "premium", "name": "Premium", "price_usd": 12},
    ]
    return {"plans": plans}


@app.post("/subscribe")
async def subscribe(plan_id: str):
    # Placeholder: implement subscription logic and DB persistence
    return {"status": "ok", "plan_id": plan_id}
