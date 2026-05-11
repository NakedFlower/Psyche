from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import survey, photo, persona, chat
from app.database import engine, Base

# Create all database tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Psyche API", description="AI self-reflection service API")

# CORS configuration — allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(survey.router, prefix="/api/survey", tags=["Survey"])
app.include_router(photo.router, prefix="/api/photo", tags=["Photo"])
app.include_router(persona.router, prefix="/api/persona", tags=["Persona"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])


@app.get("/")
def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "Psyche API"}
