from datetime import datetime, timedelta, timezone
import jwt
from pwdlib import PasswordHash
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db
from .models import User

password_hash = PasswordHash.recommended()
bearer = HTTPBearer()

def hash_password(password: str) -> str:
    return password_hash.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)

def make_token(user_id: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode({"sub": str(user_id), "exp": exp}, settings.jwt_secret, algorithm="HS256")

def current_user(creds: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
        uid = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Nieprawidłowa lub wygasła sesja")
    user = db.get(User, uid)
    if not user:
        raise HTTPException(status_code=401, detail="Konto nie istnieje")
    return user
