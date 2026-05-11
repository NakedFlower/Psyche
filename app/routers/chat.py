import random
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.models.user import Session, ChatMessage
from app.schemas.chat import ChatRequest, ChatResponse, ChatHistoryResponse, ChatMessageItem

router = APIRouter()

MOCK_REPLIES = [
    "네가 지금 걱정하는 그 일, 사실 별거 아니었어. 시간이 지나면 알게 될 거야.",
    "그때의 너는 정말 최선을 다하고 있었어. 나는 그게 자랑스러워.",
    "지금 힘든 거 알아. 근데 포기하지 마. 네가 거기서 멈추지 않았기 때문에 내가 여기 있는 거야.",
    "운동 좀 해. 진짜로. 나중에 후회한다.",
    "지금 네가 가장 두려워하는 것에 가까이 가봐. 거기에 네 성장이 있어.",
    "잠 좀 자. 너 지금 수면 부족이잖아. 건강이 최고야.",
    "그 사람한테 먼저 연락해봐. 네가 생각하는 것보다 상대도 너를 기다리고 있을 거야.",
    "돈 걱정은 좀 내려놔. 지금 네가 쌓고 있는 경험이 나중에 다 돈이 돼.",
    "지금 읽고 있는 그 책, 끝까지 읽어. 네 인생에 꽤 큰 영향을 줄 거야.",
    "가끔은 아무것도 하지 않는 시간이 필요해. 그게 게으른 게 아니야.",
]


@router.post("", response_model=ChatResponse)
def send_message(chat: ChatRequest, db: DBSession = Depends(get_db)):
    """
    Send a chat message and receive a mock AI response.
    Both user message and assistant reply are saved to the database.
    """
    # Ensure session exists
    existing_session = db.query(Session).filter(Session.id == chat.session_id).first()
    if not existing_session:
        new_session = Session(id=chat.session_id)
        db.add(new_session)
        db.commit()

    # Save user message
    user_msg = ChatMessage(
        session_id=chat.session_id,
        persona_id=chat.persona_id,
        role="user",
        content=chat.message,
    )
    db.add(user_msg)
    db.commit()

    # Generate mock reply
    reply_text = random.choice(MOCK_REPLIES)

    # Save assistant message
    assistant_msg = ChatMessage(
        session_id=chat.session_id,
        persona_id=chat.persona_id,
        role="assistant",
        content=reply_text,
    )
    db.add(assistant_msg)
    db.commit()
    db.refresh(assistant_msg)

    return ChatResponse(reply=reply_text, message_id=assistant_msg.id)


@router.get("/history/{session_id}", response_model=ChatHistoryResponse)
def get_chat_history(session_id: str, db: DBSession = Depends(get_db)):
    """
    Retrieve the full chat history for a given session.
    Messages are ordered chronologically.
    """
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )

    return ChatHistoryResponse(
        messages=[
            ChatMessageItem(role=msg.role, content=msg.content)
            for msg in messages
        ]
    )
