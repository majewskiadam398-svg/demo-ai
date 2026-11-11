import chess
import hashlib
from collections import Counter
from sqlalchemy.orm import Session
from .models import MovePattern

def position_key(board: chess.Board) -> str:
    # Stabilny klucz: taki sam po restarcie procesu, bez danych osobowych.
    payload = f"{board.board_fen()}|{int(board.turn)}|{int(board.castling_rights != 0)}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def observe_game(db: Session, pgn_text: str, user_id: int):
    import chess.pgn
    import io
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None:
        return
    board = game.board()
    for move in game.mainline_moves():
        key = position_key(board)
        san = board.san(move)
        row = db.query(MovePattern).filter_by(user_id=user_id, feature_key=key, san=san).first()
        if row:
            row.count += 1
        else:
            db.add(MovePattern(user_id=user_id, feature_key=key, san=san, count=1))
        board.push(move)

def predict_human_moves(board: chess.Board, db: Session, user_id: int):
    legal = list(board.legal_moves)
    if not legal:
        return []
    key = position_key(board)
    rows = db.query(MovePattern).filter_by(user_id=user_id, feature_key=key).all()
    counts = Counter({r.san: r.count for r in rows})
    total = sum(counts.values())
    ranked = []
    for move in legal:
        san = board.san(move)
        score = (counts[san] + 1) / (total + len(legal))
        ranked.append({"san": san, "probability": round(score, 4), "evidence": counts[san]})
    return sorted(ranked, key=lambda x: x["probability"], reverse=True)[:5]

def evaluate_position(board: chess.Board):
    values = {chess.PAWN: 1, chess.KNIGHT: 3.2, chess.BISHOP: 3.3, chess.ROOK: 5, chess.QUEEN: 9}
    score = 0.0
    for piece_type, value in values.items():
        score += len(board.pieces(piece_type, chess.WHITE)) * value
        score -= len(board.pieces(piece_type, chess.BLACK)) * value
    return {"material_balance_white": round(score, 2),
            "note": "Ocena materiałowa MVP; nie zastępuje analizy silnikiem szachowym."}
