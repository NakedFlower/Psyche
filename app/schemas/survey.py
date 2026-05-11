from pydantic import BaseModel
from typing import Optional


class SurveyCreate(BaseModel):
    """Request schema for creating a survey."""
    session_id: str
    mbti: str
    values_text: str
    habits_text: str
    interests_text: str
    goals_text: str
    worries_text: str
    photo_key: Optional[str] = None


class SurveyResponse(BaseModel):
    """Response schema after survey creation."""
    survey_id: int
    session_id: str

    class Config:
        from_attributes = True
