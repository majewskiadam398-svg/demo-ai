from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime

class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=24, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=10, max_length=128)

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class GameIn(BaseModel):
    pgn: str = Field(min_length=2, max_length=30000)
    result: str = Field(default="*", pattern=r"^(1-0|0-1|1/2-1/2|\*)$")

class GameOut(BaseModel):
    id: int
    pgn: str
    result: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
