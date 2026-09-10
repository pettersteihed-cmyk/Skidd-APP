"""Minimal lokal statisk filserver med CORS, bara for att lata Mapbox GL
(pa localhost:5175) hamta tidsavstands-tiles fran den har mappen for ett
snabbt visuellt test - INTE avsedd for nagot annat an lokal felsokning.

Valfria CLI-argument for att peka pa en annan tile-mapp/port (t.ex. den
binara varianten i tiles_binary/), annars samma default som forut:
    python cors_server.py [directory] [port]
"""
import sys
import http.server
import functools

BASE = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8765
DIRECTORY = sys.argv[1] if len(sys.argv) > 1 else f"{BASE}/tiles"


class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(CORSRequestHandler, directory=DIRECTORY)
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
        print(f"Serverar {DIRECTORY} pa http://127.0.0.1:{PORT}")
        httpd.serve_forever()
