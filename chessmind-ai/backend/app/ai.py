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


# --- ChessMind native search engine (no Stockfish or external engine) ---
ENGINE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 335,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 0,
}
MATE_SCORE = 100000

def _evaluate_white(board: chess.Board) -> int:
    """Heuristic evaluation in centipawns from White's point of view."""
    if board.is_checkmate():
        return -MATE_SCORE if board.turn == chess.WHITE else MATE_SCORE
    if board.is_stalemate() or board.is_insufficient_material() or board.can_claim_draw():
        return 0

    score = 0
    for square, piece in board.piece_map().items():
        value = ENGINE_VALUES[piece.piece_type]
        file_index = chess.square_file(square)
        rank_index = chess.square_rank(square)
        relative_rank = rank_index if piece.color == chess.WHITE else 7 - rank_index
        center_distance = abs(3.5 - file_index) + abs(3.5 - rank_index)
        positional = 0
        if piece.piece_type == chess.PAWN:
            positional = relative_rank * 7 + int(6 - abs(3.5 - file_index) * 2)
        elif piece.piece_type in (chess.KNIGHT, chess.BISHOP):
            positional = int((7 - center_distance) * (5 if piece.piece_type == chess.KNIGHT else 3))
        elif piece.piece_type == chess.QUEEN:
            positional = int((7 - center_distance) * 1)
        elif piece.piece_type == chess.KING and board.fullmove_number < 25:
            positional = -int((7 - center_distance) * 4)
        signed = value + positional
        score += signed if piece.color == chess.WHITE else -signed

    # Small mobility term; legal move generation is already available here.
    mobility = board.legal_moves.count()
    score += mobility * (2 if board.turn == chess.WHITE else -2)
    return score

def _move_order_score(board: chess.Board, move: chess.Move) -> int:
    score = 0
    if board.is_capture(move):
        victim = board.piece_at(move.to_square)
        attacker = board.piece_at(move.from_square)
        victim_value = ENGINE_VALUES.get(victim.piece_type, 100) if victim else 100
        attacker_value = ENGINE_VALUES.get(attacker.piece_type, 100) if attacker else 100
        score += 10000 + victim_value - attacker_value // 10
    if move.promotion:
        score += 8000 + ENGINE_VALUES.get(move.promotion, 0)
    if board.gives_check(move):
        score += 500
    return score

def _negamax(board: chess.Board, depth: int, alpha: int, beta: int, ply: int = 0) -> int:
    if board.is_checkmate():
        return -MATE_SCORE + ply
    if board.is_stalemate() or board.is_insufficient_material() or board.can_claim_draw():
        return 0
    if depth <= 0:
        value = _evaluate_white(board)
        return value if board.turn == chess.WHITE else -value

    best = -MATE_SCORE
    moves = sorted(list(board.legal_moves), key=lambda m: _move_order_score(board, m), reverse=True)
    for move in moves:
        board.push(move)
        score = -_negamax(board, depth - 1, -beta, -alpha, ply + 1)
        board.pop()
        if score > best:
            best = score
        if score > alpha:
            alpha = score
        if alpha >= beta:
            break
    return best

def analyze_position(board: chess.Board, depth: int = 3):
    """Return principal candidate moves from the built-in alpha-beta search."""
    if board.is_game_over(claim_draw=True):
        return {"evaluation_cp": _evaluate_white(board), "depth": depth, "best_moves": [], "status": board.result(claim_draw=True)}

    root_turn = board.turn
    candidates = []
    moves = sorted(list(board.legal_moves), key=lambda m: _move_order_score(board, m), reverse=True)
    for move in moves:
        san = board.san(move)
        board.push(move)
        score_for_moving_side = -_negamax(board, depth - 1, -MATE_SCORE, MATE_SCORE, 1)
        board.pop()
        score_white = score_for_moving_side if root_turn == chess.WHITE else -score_for_moving_side
        candidates.append({
            "from": chess.square_name(move.from_square),
            "to": chess.square_name(move.to_square),
            "san": san,
            "score_cp": int(score_white),
        })

    candidates.sort(key=lambda item: item["score_cp"], reverse=(root_turn == chess.WHITE))
    best_score = candidates[0]["score_cp"] if candidates else _evaluate_white(board)
    palette = ["#16a34a", "#2563eb", "#0d9488"]
    for index, item in enumerate(candidates[:3]):
        item["rank"] = index + 1
        item["color"] = palette[index]
        item["quality"] = "najlepszy" if index == 0 else "alternatywa"
        item["score"] = round(item["score_cp"] / 100, 2)
    return {
        "evaluation_cp": int(_evaluate_white(board)),
        "best_score_cp": int(best_score),
        "depth": depth,
        "best_moves": candidates[:3],
        "status": "ok",
    }
