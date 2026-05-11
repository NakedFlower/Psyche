from pydantic import BaseModel
from typing import List


class ChatRequest(BaseModel):
    """Request schema for sending a chat message."""
    session_id: str
    persona_id: int
    message: str


class ChatResponse(BaseModel):
    """Response schema after chat message processing."""
    reply: str
    message_id: int


class ChatMessageItem(BaseModel):
    """Single chat message for history display."""
    role: str
    content: str

    class Config:
        from_attributes = True


class ChatHistoryResponse(BaseModel):
    """Response schema for chat history."""
    messages: List[ChatMessageItem]
