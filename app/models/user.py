import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Session(Base):
    """Represents a user session identified by UUID."""
    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow)

    surveys = relationship("Survey", back_populates="session")
    personas = relationship("Persona", back_populates="session")
    chat_messages = relationship("ChatMessage", back_populates="session")


class Survey(Base):
    """Stores user survey responses including MBTI, values, habits, etc."""
    __tablename__ = "surveys"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("sessions.id"))
    mbti = Column(String(10))
    values_text = Column(Text)
    habits_text = Column(Text)
    interests_text = Column(Text)
    goals_text = Column(Text)
    worries_text = Column(Text)
    photo_key = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="surveys")


class Persona(Base):
    """Stores persona configuration with weight sliders."""
    __tablename__ = "personas"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("sessions.id"))
    optimism_weight = Column(Float)
    value_weight = Column(Float)
    tone_weight = Column(Float)
    persona_description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="personas")
    chat_messages = relationship("ChatMessage", back_populates="persona")


class ChatMessage(Base):
    """Stores individual chat messages between user and AI persona."""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("sessions.id"))
    persona_id = Column(Integer, ForeignKey("personas.id"))
    role = Column(Enum("user", "assistant", name="message_role"))
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="chat_messages")
    persona = relationship("Persona", back_populates="chat_messages")
