from pydantic import BaseModel, Field


class SubscriptionCreate(BaseModel):
    user_id: int = Field(gt=0)
    plan_id: int = Field(gt=0)


class SubscriptionResponse(BaseModel):
    id: int
    user_id: int
    plan_id: int
    plan_name: str
    price_usd: float
    status: str
