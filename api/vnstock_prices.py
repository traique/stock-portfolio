from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import os
from datetime import datetime

from vnstock import Trading, register_user

REGISTERED = False


def ensure_vnstock_auth():
    global REGISTERED
    if REGISTERED:
        return

    api_key = os.getenv("VNSTOCK_API_KEY", "").strip()
    if api_key:
        try:
            register_user(api_key=api_key)
        except Exception:
            pass

    REGISTERED = True


def normalize_symbols(raw: str):
    return list(dict.fromkeys([s.strip().upper() for s in raw.split(",") if s.strip()]))


def to_number(value):
    try:
        number = float(value)
        if number > 0:
            return number
    except Exception:
        pass
    return 0.0


def fetch_prices(symbols):
    ensure_vnstock_auth()

    # Theo docs, có thể gọi nhiều mã cùng lúc và flatten cột để lấy match_price dễ hơn
    trading = Trading(source="KBS")
    board = trading.price_board(
        symbols_list=symbols,
        flatten_columns=True,
        drop_levels=[0],
    )

    if board is None or getattr(board, "empty", False):
        raise ValueError("Không lấy được dữ liệu bảng giá từ Vnstock")

    board.columns = [str(col).strip().lower() for col in board.columns]
    rows = board.to_dict(orient="records")

    prices = {}
    debug_rows = []

    for row in rows:
        symbol = str(row.get("symbol", "")).upper().strip()
        if not symbol:
            continue

        # Ưu tiên đúng cột match_price như docs
        price = to_number(row.get("match_price"))

        # fallback nhẹ nếu match_price trống
        if not price:
            for key in ["close", "close_price", "price", "last_price", "bid_1_price", "ask_1_price"]:
                price = to_number(row.get(key))
                if price:
                    break

        if price:
            prices[symbol] = price

        debug_rows.append(
            {
                "symbol": symbol,
                "match_price": row.get("match_price"),
                "close": row.get("close"),
                "close_price": row.get("close_price"),
                "price": row.get("price"),
                "last_price": row.get("last_price"),
            }
        )

    if not prices:
        raise ValueError("Có dữ liệu trả về nhưng không đọc được giá hợp lệ")

    return prices, debug_rows


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            raw_symbols = query.get("symbols", [""])[0]
            debug_mode = query.get("debug", ["0"])[0] == "1"
            symbols = normalize_symbols(raw_symbols)

            if not symbols:
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    json.dumps(
                        {
                            "prices": {},
                            "updatedAt": datetime.utcnow().isoformat() + "Z",
                            "provider": "vnstock-empty",
                        }
                    ).encode("utf-8")
                )
                return

            prices, debug_rows = fetch_prices(symbols)

            payload = {
                "prices": prices,
                "updatedAt": datetime.utcnow().isoformat() + "Z",
                "provider": "vnstock-kbs",
            }

            if debug_mode:
                payload["debug"] = debug_rows

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode("utf-8"))

        except Exception as error:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    {
                        "error": str(error),
                        "provider": "vnstock-kbs",
                    }
                ).encode("utf-8")
)
