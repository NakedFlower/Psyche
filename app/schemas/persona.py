from pydantic import BaseModel


class PersonaCreate(BaseModel):
    """Request schema for creating a persona with weight sliders."""
    session_id: str
    optimism_weight: float
    value_weight: float
    tone_weight: float


class PersonaResponse(BaseModel):
    """Response schema after persona creation."""
    persona_id: int
    persona_description: str

    class Config:
        from_attributes = True
