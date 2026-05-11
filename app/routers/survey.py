import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.models.user import Session, Survey
from app.schemas.survey import SurveyCreate, SurveyResponse

router = APIRouter()


@router.post("", response_model=SurveyResponse)
def create_survey(survey: SurveyCreate, db: DBSession = Depends(get_db)):
    """
    Save user survey data.
    Creates a session if one doesn't exist for the given session_id.
    """
    # Ensure session exists
    existing_session = db.query(Session).filter(Session.id == survey.session_id).first()
    if not existing_session:
        new_session = Session(id=survey.session_id)
        db.add(new_session)
        db.commit()

    db_survey = Survey(
        session_id=survey.session_id,
        mbti=survey.mbti,
        values_text=survey.values_text,
        habits_text=survey.habits_text,
        interests_text=survey.interests_text,
        goals_text=survey.goals_text,
        worries_text=survey.worries_text,
        photo_key=survey.photo_key,
    )
    db.add(db_survey)
    db.commit()
    db.refresh(db_survey)

    return SurveyResponse(survey_id=db_survey.id, session_id=db_survey.session_id)
