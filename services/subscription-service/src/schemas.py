from pydantic import BaseModel, Field


class SubscriptionCreate(BaseModel):
    user_id: str = Field(min_length=1)
    plan_id: int = Field(gt=0)


class SubscriptionUpdate(BaseModel):
    plan_id: int = Field(gt=0)


class SubscriptionResponse(BaseModel):
    id: int
    user_id: str
    plan_id: int
    plan_name: str
    price_usd: float
    status: str
