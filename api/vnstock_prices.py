import json
import time
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from vnstock import Trading


# ===== CONFIG =====
SOURCES = ["SSI", "VND", "VCI"]
MAX_RETRIES = 2
SLEEP_BETWEEN_RETRIES = 0.5


def fetch_from_source(symbols, source):
    try:
        trading = Trading(source=source)
        board = trading.price_board(symbols=symbols)

        if board is None or board.empty:
            raise ValueError("Empty board")

        return board

    except Exception as e:
        raise Exception(f"{source} failed: {str(e)}")


def extract_prices(board):
    results = {}

    for _, row in board.iterrows():
        symbol = str(row.get("symbol", "")).upper()

        price = None

        # fallback nhiều field vì vnstock hay đổi format
        for key in [
            "match_price",
            "close",
            "close_price",
            "price",
            "last",
        ]:
            if key in row and row[key]:
                price = row[key]
                break

        if price is None:
            price = 0

        results[symbol] = int(price)

    return results


def get_prices(symbols):
    errors = []

    for source in SOURCES:
        for attempt in range(MAX_RETRIES):
            try:
                board = fetch_from_source(symbols, source)
                prices = extract_prices(board)

                # validate: ít nhất 1 giá hợp lệ
                if any(v > 0 for v in prices.values()):
                    return {
                        "prices": prices,
                        "provider": f"vnstock-{source.lower()}",
                        "error": None,
                    }

                raise Exception("All prices = 0")

            except Exception as e:
                err_msg = f"{source} attempt {attempt+1}: {str(e)}"
                print(err_msg)
                errors.append(err_msg)
                time.sleep(SLEEP_BETWEEN_RETRIES)

    return {
        "prices": {s: 0 for s in symbols},
        "provider": "vnstock-failed",
        "error": "; ".join(errors),
    }


# ===== VERCEL HANDLER =====
class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            query = parse_qs(urlparse(self.path).query)
            symbols_param = query.get("symbols", [""])[0]

            symbols = [
                s.strip().upper()
                for s in symbols_param.split(",")
                if s.strip()
            ]

            if not symbols:
                self.respond(400, {"error": "Missing symbols"})
                return

            result = get_prices(symbols)

            response = {
                "prices": result["prices"],
                "provider": result["provider"],
                "error": result["error"],
                "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }

            self.respond(200, response)

        except Exception as e:
            self.respond(500, {"error": str(e)})

    def respond(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
