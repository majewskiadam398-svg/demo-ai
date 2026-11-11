import chess
import hashlib
from collections import Counter
from sqlalchemy.orm import Session
from .models import MovePattern

def position_key(board: chess.Board) -> str:
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

ENGINE_VALUES = {
    chess.PAWN: 100, chess.KNIGHT: 320, chess.BISHOP: 335,
    chess.ROOK: 500, chess.QUEEN: 900, chess.KING: 0,
}
MATE_SCORE = 100000

def _evaluate_white(board: chess.Board) -> int:
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

def analyze_position(board: chess.Board, depth: int = 2):
    """Fast heuristic search: depth 2 and a bounded root candidate set for live UI."""
    if board.is_game_over(claim_draw=True):
        return {"evaluation_cp": _evaluate_white(board), "depth": depth, "best_moves": [], "status": board.result(claim_draw=True)}
    root_turn = board.turn
    moves = sorted(list(board.legal_moves), key=lambda m: _move_order_score(board, m), reverse=True)
    # Bound work in unusually wide positions so live analysis remains responsive.
    moves = moves[:12]
    candidates = []
    for move in moves:
        san = board.san(move)
        board.push(move)
        score_for_moving_side = -_negamax(board, depth - 1, -MATE_SCORE, MATE_SCORE, 1)
        board.pop()
        score_white = score_for_moving_side if root_turn == chess.WHITE else -score_for_moving_side
        candidates.append({"from": chess.square_name(move.from_square), "to": chess.square_name(move.to_square),
                           "san": san, "score_cp": int(score_white)})
    candidates.sort(key=lambda item: item["score_cp"], reverse=(root_turn == chess.WHITE))
    best_score = candidates[0]["score_cp"] if candidates else _evaluate_white(board)
    palette = ["#16a34a", "#2563eb", "#0d9488"]
    for index, item in enumerate(candidates[:3]):
        item["rank"] = index + 1
        item["color"] = palette[index]
        item["quality"] = "najlepszy" if index == 0 else "alternatywa"
        item["score"] = round(item["score_cp"] / 100, 2)
    return {"evaluation_cp": int(_evaluate_white(board)), "best_score_cp": int(best_score),
            "depth": depth, "best_moves": candidates[:3], "status": "ok"}


def _training_explanation(board: chess.Board, move: chess.Move) -> str:
    piece = board.piece_at(move.from_square)
    san = board.san(move)
    target = chess.square_name(move.to_square)
    if board.is_capture(move):
        victim = board.piece_at(move.to_square)
        victim_name = {chess.PAWN:"piona", chess.KNIGHT:"skoczka", chess.BISHOP:"gońca", chess.ROOK:"wieżę", chess.QUEEN:"hetmana"}.get(victim.piece_type if victim else 0, "figurę")
        return f"Ruch {san}: bierze {victim_name} na {target}. Po każdym biciu sprawdź, czy Twoja figura nie zostaje zaatakowana i czy nie oddajesz ważniejszej figury."
    if board.gives_check(move):
        return f"Ruch {san} daje szacha. Król przeciwnika musi odpowiedzieć na zagrożenie — sprawdź, czy możesz potem zdobyć materiał lub poprawić ustawienie figur."
    if piece and piece.piece_type == chess.PAWN and chess.square_rank(move.to_square) in (3, 4):
        return f"Ruch {san} walczy o centrum. Piony w centrum ograniczają figury przeciwnika i otwierają linie dla gońców oraz hetmana."
    if piece and piece.piece_type in (chess.KNIGHT, chess.BISHOP):
        return f"Ruch {san} rozwija figurę. Wyprowadzaj lekkie figury na aktywne pola, kontroluj centrum i przygotuj bezpieczne schronienie dla króla."
    if piece and piece.piece_type == chess.KING:
        return f"Ruch {san} poprawia bezpieczeństwo króla. Zwróć uwagę na otwarte linie i możliwe szachy."
    return f"Ruch {san} poprawia ustawienie figur. Zanim odpowiesz, sprawdź groźby przeciwnika, bezpieczeństwo własnego króla i czy możesz coś zdobyć."

def choose_training_move(board: chess.Board, difficulty: str = "easy", model: str = "balanced",
                         db: Session | None = None, user_id: int | None = None):
    """Select a move with ChessMind's own heuristic search; deliberately weaker modes add controlled noise."""
    import random
    settings = {
        "easy": (1, 0.72), "normal": (2, 0.42), "hard": (3, 0.18),
        "impossible": (3, 0.03), "adaptive": (2, 0.28),
    }
    depth, randomness = settings.get(difficulty, settings["easy"])
    if board.is_game_over(claim_draw=True):
        return None
    legal = list(board.legal_moves)
    if model == "adaptive" and db is not None and user_id is not None:
        key = position_key(board)
        rows = db.query(MovePattern).filter_by(user_id=user_id, feature_key=key).all()
        learned = {row.san: row.count for row in rows}
        if learned:
            move = max(legal, key=lambda m: learned.get(board.san(m), 0))
            return {"uci": move.uci(), "san": board.san(move),
                    "explanation": "Wybieram ruch zgodny z Twoimi wcześniejszymi partiami w tej pozycji. Model dopasowany uczy się na zapisanych przez Ciebie ruchach.",
                    "model": "Twój styl — model adaptacyjny"}
    candidates = []
    for move in legal:
        san = board.san(move)
        board.push(move)
        score = -_negamax(board, max(0, depth - 1), -MATE_SCORE, MATE_SCORE, 1)
        board.pop()
        candidates.append((move, score, san))
    candidates.sort(key=lambda x: x[1], reverse=True)
    pool = candidates[:max(1, min(len(candidates), 3 if difficulty == "easy" else 2 if difficulty == "normal" else 1))]
    if model == "aggressive":
        tactical = [x for x in candidates if board.is_capture(x[0]) or board.gives_check(x[0])]
        if tactical:
            pool = tactical[:max(1, len(pool))]
    elif model == "solid":
        safe = []
        for item in candidates:
            move = item[0]
            board.push(move)
            attacked = board.is_check() or any(board.is_attacked_by(not board.turn, sq) for sq in [move.to_square])
            board.pop()
            if not attacked: safe.append(item)
        if safe: pool = safe[:max(1, len(pool))]
    if len(pool) > 1 and random.random() < randomness:
        chosen = random.choice(pool)
    else:
        chosen = pool[0]
    move = chosen[0]
    return {"uci": move.uci(), "san": chosen[2],
            "explanation": _training_explanation(board, move),
            "model": {"balanced":"ChessMind — zrównoważony","aggressive":"ChessMind — taktyczny","solid":"ChessMind — pozycyjny","adaptive":"Twój styl — model adaptacyjny"}.get(model, "ChessMind — zrównoważony")}
