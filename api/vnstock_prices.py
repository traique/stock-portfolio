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


def flatten_columns(df):
    try:
        if hasattr(df.columns, "levels"):
            df.columns = [
                "_".join([str(part) for part in col if str(part) != ""]).strip("_").lower()
                if isinstance(col, tuple)
                else str(col).lower()
                for col in df.columns
            ]
        else:
            df.columns = [str(c).lower() for c in df.columns]
    except Exception:
        pass
    return df


def pick_price(row: dict):
    candidates = [
        "match_price",
        "last_price",
        "price",
        "close",
        "close_price",
        "matched_price",
        "trading_price",
    ]
    for key in candidates:
        value = row.get(key)
        try:
            number = float(value)
            if number > 0:
                return number
        except Exception:
            continue
    return 0.0


def fetch_prices(symbols):
    ensure_vnstock_auth()

    # KBS được Vnstock khuyến nghị dùng thường xuyên vì dữ liệu gọn và ổn định hơn
    trading = Trading(source="KBS")
    board = trading.price_board(symbols)
    board = flatten_columns(board)

    rows = board.to_dict(orient="records")
    prices = {}

    for row in rows:
        symbol = str(row.get("symbol", "")).upper().strip()
        if not symbol:
            continue
        price = pick_price(row)
        if price > 0:
            prices[symbol] = price

    return prices


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            raw_symbols = query.get("symbols", [""])[0]
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

            prices = fetch_prices(symbols)

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    {
                        "prices": prices,
                        "updatedAt": datetime.utcnow().isoformat() + "Z",
                        "provider": "vnstock-kbs",
                    }
                ).encode("utf-8")
            )
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
