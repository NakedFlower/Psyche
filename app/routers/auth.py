import hashlib
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.models.user import User
from app.schemas.auth import UserCreate, UserLogin, Token

router = APIRouter()

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

@router.post("/signup", response_model=Token)
def signup(user_data: UserCreate, db: DBSession = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    new_user = User(
        email=user_data.email,
        hashed_password=hash_password(user_data.password)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return Token(
        access_token=str(new_user.id),
        token_type="bearer",
        user={"name": user_data.email.split("@")[0], "email": user_data.email}
    )

@router.post("/login", response_model=Token)
def login(user_data: UserLogin, db: DBSession = Depends(get_db)):
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user or user.hashed_password != hash_password(user_data.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    return Token(
        access_token=str(user.id),
        token_type="bearer",
        user={"name": user.email.split("@")[0], "email": user.email}
    )
