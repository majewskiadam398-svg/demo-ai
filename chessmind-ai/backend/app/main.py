import io
import os
import chess
import chess.pgn
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select
from .db import Base, engine, get_db
from .models import User, Game
from .schemas import Credentials, Token, GameIn, GameOut
from .auth import hash_password, verify_password, make_token, current_user
from .ai import observe_game, predict_human_moves, evaluate_position

Base.metadata.create_all(bind=engine)
app = FastAPI(title="ChessMind AI API", version="0.1.0")
cors_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=cors_origins,
                   allow_origin_regex=r"https://.*\.vercel\.app",
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/auth/register", response_model=Token)
def register(data: Credentials, db: Session = Depends(get_db)):
    username = data.username.lower()
    if db.scalar(select(User).where(User.username == username)):
        raise HTTPException(409, "Ten nick jest już zajęty")
    user = User(username=username, password_hash=hash_password(data.password))
    db.add(user); db.commit(); db.refresh(user)
    return {"access_token": make_token(user.id)}

@app.post("/auth/login", response_model=Token)
def login(data: Credentials, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == data.username.lower()))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Nieprawidłowy nick lub hasło")
    return {"access_token": make_token(user.id)}

@app.get("/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "username": user.username}

@app.get("/games", response_model=list[GameOut])
def list_games(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return list(db.scalars(select(Game).where(Game.user_id == user.id).order_by(Game.created_at.desc())))

@app.post("/games", response_model=GameOut)
def save_game(data: GameIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    try:
        parsed = chess.pgn.read_game(io.StringIO(data.pgn))
        if parsed is None:
            raise ValueError()
    except Exception:
        raise HTTPException(400, "Nieprawidłowy PGN")
    game = Game(user_id=user.id, pgn=data.pgn, result=data.result)
    db.add(game)
    observe_game(db, data.pgn, user.id)
    db.commit(); db.refresh(game)
    return game

@app.post("/ai/predict")
def predict(payload: dict, db: Session = Depends(get_db), user: User = Depends(current_user)):
    fen = payload.get("fen", "")
    try:
        board = chess.Board(fen)
        if not board.is_valid(): raise ValueError()
    except Exception:
        raise HTTPException(400, "Nieprawidłowa pozycja FEN")
    return {"predictions": predict_human_moves(board, db, user.id),
            "evaluation": evaluate_position(board),
            "model": "pattern-frequency-v0",
            "warning": "Predykcje są eksperymentalne; brak jeszcze walidowanej skuteczności."}


@app.post("/ai/analyze")
def analyze(payload: dict):
    """Public live analysis endpoint powered by ChessMind's own search."""
    fen = payload.get("fen", "")
    try:
        board = chess.Board(fen)
        if not board.is_valid():
            raise ValueError()
    except Exception:
        raise HTTPException(400, "Nieprawidłowa pozycja FEN")
    from .ai import analyze_position
    result = analyze_position(board, depth=3)
    result["engine"] = "ChessMind Native Engine"
    result["note"] = "Własny silnik heurystyczny ChessMind AI; wynik orientacyjny, nie poziom Stockfisha."
    return result
