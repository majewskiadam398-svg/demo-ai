from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    games = relationship("Game", back_populates="user", cascade="all, delete-orphan")

class Game(Base):
    __tablename__ = "games"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    pgn: Mapped[str] = mapped_column(Text)
    result: Mapped[str] = mapped_column(String(12), default="*")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="games")

class MovePattern(Base):
    __tablename__ = "move_patterns"
    id: Mapped[int] = mapped_column(primary_key=True)
    # Zagregowane cechy pozycji i wybór ruchu; nie zapisujemy nicku ani surowej partii.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    feature_key: Mapped[str] = mapped_column(String(128), index=True)
    san: Mapped[str] = mapped_column(String(16))
    count: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (UniqueConstraint("user_id", "feature_key", "san"),)
