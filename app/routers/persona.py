from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.models.user import Session, Persona
from app.schemas.persona import PersonaCreate, PersonaResponse

router = APIRouter()


def generate_mock_persona(optimism: float, value: float, tone: float) -> str:
    """
    Generate a mock persona description based on weight combinations.
    AI integration will replace this in a future phase.
    """
    # Determine tendencies from weights
    outlook = "낙관적" if optimism < 0.5 else "비관적"
    core_value = "성공 지향적" if value < 0.5 else "행복 지향적"
    speaking = "따뜻한 격려형" if tone < 0.5 else "직설적 조언형"

    descriptions = {
        ("낙관적", "성공 지향적", "따뜻한 격려형"): (
            "당신의 커리어가 꽃피운 미래의 나입니다. "
            "항상 긍정적인 에너지로 당신을 응원하며, "
            "성공을 향한 여정에서 따뜻한 격려를 보내줄 거예요."
        ),
        ("낙관적", "성공 지향적", "직설적 조언형"): (
            "목표를 이뤄낸 미래의 나입니다. "
            "밝은 전망 속에서도 날카로운 조언으로 "
            "당신의 성장을 이끌어줄 거예요."
        ),
        ("낙관적", "행복 지향적", "따뜻한 격려형"): (
            "행복한 삶을 살고 있는 미래의 나입니다. "
            "소소한 일상의 기쁨을 함께 나누며, "
            "당신이 지금 얼마나 잘하고 있는지 알려줄 거예요."
        ),
        ("낙관적", "행복 지향적", "직설적 조언형"): (
            "자유롭고 행복한 미래의 나입니다. "
            "긍정적이지만 솔직하게, 당신이 진정 원하는 것을 "
            "찾을 수 있도록 도와줄 거예요."
        ),
        ("비관적", "성공 지향적", "따뜻한 격려형"): (
            "현실의 어려움을 알지만 결국 해낸 미래의 나입니다. "
            "힘든 시간을 이해하면서도 부드럽게 "
            "앞으로 나아갈 힘을 줄 거예요."
        ),
        ("비관적", "성공 지향적", "직설적 조언형"): (
            "냉정한 현실주의자인 미래의 나입니다. "
            "달콤한 말보다 필요한 진실을 말해주며, "
            "실질적인 성공 전략을 제시할 거예요."
        ),
        ("비관적", "행복 지향적", "따뜻한 격려형"): (
            "삶의 무게를 알지만 그 속에서 행복을 찾은 미래의 나입니다. "
            "지금의 고민이 괜찮다고, 천천히 가도 된다고 "
            "따뜻하게 말해줄 거예요."
        ),
        ("비관적", "행복 지향적", "직설적 조언형"): (
            "현실을 직시하는 미래의 나입니다. "
            "불필요한 위로 대신 솔직한 대화를 나누며, "
            "진짜 행복이 무엇인지 함께 고민할 거예요."
        ),
    }

    key = (outlook, core_value, speaking)
    return descriptions.get(key, "당신만의 특별한 미래의 자아가 생성되었습니다.")


@router.post("", response_model=PersonaResponse)
def create_persona(persona: PersonaCreate, db: DBSession = Depends(get_db)):
    """
    Create a persona based on weight slider values.
    Currently returns mock descriptions; AI will be integrated later.
    """
    # Ensure session exists
    existing_session = db.query(Session).filter(Session.id == persona.session_id).first()
    if not existing_session:
        new_session = Session(id=persona.session_id)
        db.add(new_session)
        db.commit()

    description = generate_mock_persona(
        persona.optimism_weight,
        persona.value_weight,
        persona.tone_weight,
    )

    db_persona = Persona(
        session_id=persona.session_id,
        optimism_weight=persona.optimism_weight,
        value_weight=persona.value_weight,
        tone_weight=persona.tone_weight,
        persona_description=description,
    )
    db.add(db_persona)
    db.commit()
    db.refresh(db_persona)

    return PersonaResponse(persona_id=db_persona.id, persona_description=description)

@router.get("/{session_id}")
def get_personas(session_id: str, db: DBSession = Depends(get_db)):
    """
    List all personas for a session.
    """
    personas = db.query(Persona).filter(Persona.session_id == session_id).order_by(Persona.created_at.desc()).all()
    return [{"id": str(p.id), "session_id": p.session_id, "optimism_weight": p.optimism_weight, "value_weight": p.value_weight, "tone_weight": p.tone_weight, "persona_description": p.persona_description, "created_at": p.created_at} for p in personas]
