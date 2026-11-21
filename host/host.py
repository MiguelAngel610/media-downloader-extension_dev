import sys
import json
import struct
import subprocess
import os
import time
import datetime
import re
import urllib.request
import threading
import socket
import tempfile
import importlib.util
import urllib.parse
from typing import Any, Dict, List, Optional

try:
    import yt_dlp
    HAS_YTDLP = True
except ImportError:
    HAS_YTDLP = False

class EnvironmentSetup:
    @staticmethod
    def inject_paths():
        _scripts_dir = os.path.join(os.path.dirname(sys.executable), "Scripts")
        if os.path.exists(_scripts_dir) and _scripts_dir not in os.environ.get("PATH", ""):
            os.environ["PATH"] = _scripts_dir + os.pathsep + os.environ.get("PATH", "")
            
        _winget_dir = os.path.join(os.path.expanduser("~"), "AppData", "Local", "Microsoft", "WinGet", "Packages")
        if os.path.exists(_winget_dir):
            for entry in os.listdir(_winget_dir):
                if "ffmpeg" in entry.lower():
                    pkg_path = os.path.join(_winget_dir, entry)
                    for root, dirs, files in os.walk(pkg_path):
                        if "ffmpeg.exe" in files:
                            if root not in os.environ.get("PATH", ""):
                                os.environ["PATH"] = root + os.pathsep + os.environ.get("PATH", "")
                            break

class NativeMessaging:
    @staticmethod
    def get_message():
        raw_length = sys.stdin.buffer.read(4)
        if len(raw_length) == 0:
            sys.exit(0)
        message_length = struct.unpack('@I', raw_length)[0]
        message = sys.stdin.buffer.read(message_length).decode('utf-8')
        return json.loads(message)

    # Chrome rejects host->extension messages above 1 MB and drops the connection.
    MAX_MESSAGE_BYTES = 1024 * 1024
    LOG_TAIL_CHARS = 4000
    # The main loop and the TCP threads both write: each frame (length + body) must be atomic.
    _stdout_lock = threading.Lock()

    @classmethod
    def _encode(cls, message_content: Dict[str, Any]) -> bytes:
        encoded = json.dumps(message_content).encode('utf-8')
        if len(encoded) <= cls.MAX_MESSAGE_BYTES:
            return encoded
        if isinstance(message_content.get("log"), str):
            trimmed = dict(message_content, log=message_content["log"][-cls.LOG_TAIL_CHARS:], log_truncated=True)
            encoded = json.dumps(trimmed).encode('utf-8')
            if len(encoded) <= cls.MAX_MESSAGE_BYTES:
                return encoded
        return json.dumps({"status": message_content.get("status", "error"),
                           "message": "Host response exceeded Chrome's 1 MB limit and was dropped"}).encode('utf-8')

    @classmethod
    def send_message(cls, message_content: Dict[str, Any]) -> None:
        encoded_content = cls._encode(message_content)
        encoded_length = struct.pack('@I', len(encoded_content))
        with cls._stdout_lock:
            sys.stdout.buffer.write(encoded_length)
            sys.stdout.buffer.write(encoded_content)
            sys.stdout.buffer.flush()

class Logger:
    active_tcp_clients: List[socket.socket] = []
    _clients_lock = threading.Lock()

    @classmethod
    def add_client(cls, client: socket.socket) -> None:
        with cls._clients_lock:
            cls.active_tcp_clients.append(client)

    @classmethod
    def remove_client(cls, client: socket.socket) -> None:
        with cls._clients_lock:
            if client in cls.active_tcp_clients:
                cls.active_tcp_clients.remove(client)

    @classmethod
    def broadcast_log(cls, msg: Any) -> None:
        cls.log_info(msg)
        with cls._clients_lock:
            clients = list(cls.active_tcp_clients)
        payload = (str(msg) + "\n").encode('utf-8', errors='replace')
        for client in clients:
            try:
                client.sendall(payload)
            except OSError as e:
                # The client went away; drop it so later broadcasts skip it.
                cls.remove_client(client)
                cls.log_info(f"Dropped TCP log client after send failure: {e}")

    @staticmethod
    def log_info(msg: Any) -> None:
        try:
            log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "host.log")
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(str(msg) + "\n")
        except OSError as e:
            # stderr is never parsed by Chrome as protocol data, so it's the safe last resort.
            print(f"[host] Could not write host.log: {e}", file=sys.stderr)

class BridgeAuth:
    """
    Shared-secret auth for the local TCP bridge. The token is generated once and kept in
    the user's private gallery-dl folder (next to the cookies), never in the repository.
    """
    TOKEN_FILENAME = "md_bridge_token.txt"

    @classmethod
    def token_path(cls) -> str:
        return os.path.join(os.path.expanduser("~"), "gallery-dl", cls.TOKEN_FILENAME)

    @classmethod
    def load_or_create_token(cls) -> str:
        path = cls.token_path()
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                token = f.read().strip()
            if token:
                return token
        import secrets
        token = secrets.token_urlsafe(32)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(token)
        Logger.log_info(f"Generated new TCP bridge token at {path}")
        return token

    @staticmethod
    def is_valid(candidate: Any, expected: str) -> bool:
        import hmac
        # compare_digest takes constant time, so the token can't be guessed byte by byte.
        return isinstance(candidate, str) and hmac.compare_digest(candidate.encode('utf-8'), expected.encode('utf-8'))

class TCPServer:
    """Local bridge used by the Media Downloader desktop app (log console + stop button)."""
    ALLOWED_ACTIONS = frozenset({"start_backup", "stop_backup"})
    AUTH_TIMEOUT_SECONDS = 5.0
    MAX_LINE_BYTES = 64 * 1024

    def __init__(self, host: str = '127.0.0.1', port: int = 65432):
        self.host = host
        self.port = port
        self.token = ""

    def start(self) -> None:
        try:
            self.token = BridgeAuth.load_or_create_token()
        except OSError as e:
            Logger.log_info(f"TCP bridge disabled: cannot load or create token: {e}")
            return
        threading.Thread(target=self._server_thread, daemon=True).start()

    @staticmethod
    def _create_listening_socket(host: str, port: int) -> socket.socket:
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            # Windows: SO_REUSEADDR would let another process bind the same port and
            # intercept clients (and their token); exclusive use forbids that.
            server.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        else:
            server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((host, port))
        server.listen(5)
        return server

    def _server_thread(self) -> None:
        try:
            server = self._create_listening_socket(self.host, self.port)
            Logger.log_info(f"TCP Server started on port {self.port}")
        except OSError as e:
            Logger.log_info(f"Failed to start TCP Server: {e}")
            return

        while True:
            try:
                client, _addr = server.accept()
                threading.Thread(target=self._handle_client, args=(client,), daemon=True).start()
            except OSError as e:
                Logger.log_info(f"TCP Accept Error: {e}")

    @classmethod
    def _iter_lines(cls, client: socket.socket):
        """Yields one decoded JSON line at a time; a trailing message without '\\n' is flushed on close."""
        buffer = b""
        while True:
            data = client.recv(4096)
            if not data:
                break
            buffer += data
            if len(buffer) > cls.MAX_LINE_BYTES and b"\n" not in buffer:
                raise ValueError(f"TCP message exceeded {cls.MAX_LINE_BYTES} bytes")
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                if line.strip():
                    yield line.decode('utf-8', errors='replace')
        if buffer.strip():
            yield buffer.decode('utf-8', errors='replace')

    def _handle_client(self, client: socket.socket) -> None:
        authenticated = False
        client.settimeout(self.AUTH_TIMEOUT_SECONDS)
        try:
            for line in self._iter_lines(client):
                try:
                    message = json.loads(line)
                except json.JSONDecodeError as e:
                    Logger.log_info(f"TCP bridge: invalid JSON rejected: {e}")
                    break
                if not isinstance(message, dict):
                    Logger.log_info("TCP bridge: non-object message rejected")
                    break

                if not authenticated:
                    if message.get("action") != "auth" or not BridgeAuth.is_valid(message.get("token"), self.token):
                        Logger.log_info("TCP bridge: connection rejected (missing or invalid token)")
                        break
                    authenticated = True
                    client.settimeout(None)  # Log listeners stay connected indefinitely once trusted.
                    Logger.add_client(client)
                    continue

                action = message.get("action")
                if action not in self.ALLOWED_ACTIONS:
                    Logger.log_info(f"TCP bridge: action not allowed: {action!r}")
                    continue
                NativeMessaging.send_message(message)
        except (OSError, ValueError) as e:
            Logger.log_info(f"TCP Client Error: {e}")
        finally:
            Logger.remove_client(client)
            client.close()

class YTDLPLogger:
    def debug(self, msg): pass
    def info(self, msg): pass
    def warning(self, msg): pass
    def error(self, msg):
        Logger.log_info(f"yt-dlp error output: {msg}")

class DownloaderEngines:
    @staticmethod
    def yt_dlp_progress_hook(d):
        if d['status'] == 'downloading':
            try:
                percent_str = d.get('_percent_str', '').strip()
                speed_str = d.get('_speed_str', '').strip()
                eta_str = d.get('_eta_str', '').strip()
                
                if percent_str:
                    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
                    clean_percent = ansi_escape.sub('', percent_str).strip()
                    clean_speed = ansi_escape.sub('', speed_str).strip()
                    
                    NativeMessaging.send_message({
                        "status": "progress",
                        "percent": clean_percent,
                        "speed": clean_speed,
                        "eta": eta_str
                    })
            except Exception:
                pass

    @classmethod
    def execute_ytdlp_native(cls, url, ydl_opts):
        if not HAS_YTDLP:
            raise Exception("yt-dlp is not installed as a python module. Please 'pip install yt-dlp'")
            
        Logger.broadcast_log(f"Ejecutando yt-dlp nativo para URL: {url}")
        if 'progress_hooks' not in ydl_opts:
            ydl_opts['progress_hooks'] = [cls.yt_dlp_progress_hook]
            
        ydl_opts['quiet'] = True
        ydl_opts['no_warnings'] = True
        ydl_opts['logger'] = YTDLPLogger()
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                if info:
                    if 'entries' in info and len(info['entries']) > 0:
                        filename = os.path.basename(ydl.prepare_filename(info['entries'][0]))
                    else:
                        filename = os.path.basename(ydl.prepare_filename(info))
                    return {"status": "success", "message": "Descargado nativamente con yt-dlp", "filename": filename}
                return {"status": "success", "message": "Descargado nativamente con yt-dlp"}
        except Exception as e:
            Logger.broadcast_log(f"Error en yt-dlp nativo: {str(e)}")
            return {"status": "error", "message": str(e)}
            
    GALLERY_DL_TIMEOUT_SECONDS = 45

    @staticmethod
    def is_safe_http_url(url: Any) -> bool:
        """Only absolute http(s) URLs may reach an external downloader."""
        if not isinstance(url, str) or not url:
            return False
        try:
            parsed = urllib.parse.urlsplit(url)
        except ValueError:
            return False
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)

    @staticmethod
    def resolve_gallery_dl_command() -> Optional[List[str]]:
        """
        Prefer `python -m gallery_dl` from this same interpreter: it needs no PATH
        lookup and never goes through a .bat/.cmd shim, which Windows would run via
        cmd.exe even with shell=False (see CPython gh-114539).
        """
        if importlib.util.find_spec("gallery_dl") is not None:
            return [sys.executable, "-m", "gallery_dl"]
        import shutil
        executable = shutil.which("gallery-dl")
        if executable and executable.lower().endswith(".exe"):
            return [executable]
        return None

    @classmethod
    def execute_gallery_dl(cls, url: str, option_args: List[str]) -> Dict[str, Any]:
        if not cls.is_safe_http_url(url):
            Logger.broadcast_log(f"Rejected non-http(s) URL for gallery-dl: {url!r}")
            return {"status": "error", "message": "Rejected unsafe URL"}

        base_command = cls.resolve_gallery_dl_command()
        if base_command is None:
            return {"status": "error", "message": "gallery-dl is not installed. Run 'pip install gallery-dl'"}

        # shell=False: arguments go straight to CreateProcess, so '&', '|' or '>' in a URL
        # can never become shell commands. '--' stops option parsing, so a URL such as
        # '--exec=...' is treated as a URL and never as a gallery-dl option.
        cmd_args = base_command + option_args + ["--", url]
        Logger.broadcast_log(f"Executing gallery-dl: {cmd_args!r}")

        child_env = dict(os.environ, PYTHONIOENCODING="utf-8")  # Non-ASCII filenames must not crash the child
        CREATE_NO_WINDOW = 0x08000000
        process = subprocess.Popen(cmd_args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   creationflags=CREATE_NO_WINDOW, cwd=os.path.expanduser("~"),
                                   text=True, encoding="utf-8", errors="replace", env=child_env, shell=False)
        try:
            stdout, stderr = process.communicate(timeout=cls.GALLERY_DL_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            process.kill()
            stdout, stderr = process.communicate()
            Logger.broadcast_log(f"gallery-dl timed out after {cls.GALLERY_DL_TIMEOUT_SECONDS}s and was killed")
            return {"status": "error", "message": f"gallery-dl timed out after {cls.GALLERY_DL_TIMEOUT_SECONDS}s", "log": stderr}

        if process.returncode == 0:
            if DownloaderEngines.is_skipped(stdout + stderr): 
                return {"status": "skipped", "message": "Skipped by gallery-dl output"}
                
            filename = None
            try:
                lines = [line.strip() for line in stdout.strip().split('\n') if line.strip()]
                if lines:
                    last_line = lines[-1]
                    if last_line.startswith('# '): last_line = last_line[2:]
                    filename = os.path.basename(last_line)
            except: pass
            
            res = {"status": "success", "message": "IG downloaded (gallery-dl)", "log": stdout}
            if filename: res["filename"] = filename
            return res
        else:
            return {"status": "error", "message": "Gallery-dl failed", "log": stderr}

    @staticmethod
    def is_skipped(text):
        if not text: return False
        text_lower = text.lower()
        if "already exists" in text_lower or "skip" in text_lower: return True
        for line in text.split('\n'):
            ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
            clean_line = ansi_escape.sub('', line).strip()
            if clean_line.startswith('#'): return True
        return False

    @staticmethod
    def execute_direct_http(url, filepath):
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
        with urllib.request.urlopen(req, timeout=15) as response, open(filepath, 'wb') as out_file:
            out_file.write(response.read())
        Logger.broadcast_log("STATUS: SUCCESS (Direct)")
        return {"status": "success", "message": "Downloaded via direct HTTP", "filename": os.path.basename(filepath)}

class PathTraversalError(ValueError):
    """Raised when a computed output path would leave the gallery-dl directory."""

class PathGuard:
    """Turns untrusted metadata (it comes from web pages) into safe single path segments."""
    _INVALID_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
    _RESERVED_NAMES = frozenset({"CON", "PRN", "AUX", "NUL",
                                 *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))})
    MAX_SEGMENT_LENGTH = 120
    # Metadata fields that end up in folder names, file names or yt-dlp output templates.
    PATH_METADATA_KEYS = ("username", "media_category", "tweet_id", "shortcode", "user_id")

    @classmethod
    def sanitize_segment(cls, value: Any, fallback: str) -> str:
        # Separators become '_', so the result can never contain '..\' or '/' traversal.
        text = cls._INVALID_CHARS.sub("_", str(value)).strip()
        text = text.rstrip(". ")  # Windows silently strips trailing dots/spaces from names
        if not text or set(text) == {"."}:
            return fallback
        if text.split(".")[0].upper() in cls._RESERVED_NAMES:
            text = "_" + text
        # '%' would be expanded by yt-dlp's output template engine.
        text = text.replace("%", "_")
        return text[:cls.MAX_SEGMENT_LENGTH]

    @classmethod
    def sanitize_metadata(cls, metadata: Dict[str, Any]) -> Dict[str, Any]:
        sanitized = dict(metadata)
        for key in cls.PATH_METADATA_KEYS:
            value = sanitized.get(key)
            if value is None or value == "":
                continue
            clean = cls.sanitize_segment(value, "unknown")
            if clean != str(value):
                Logger.broadcast_log(f"PathGuard: sanitized metadata '{key}': {value!r} -> {clean!r}")
            sanitized[key] = clean
        return sanitized

    @staticmethod
    def ensure_inside(base_dir: str, target: str) -> str:
        """Defense in depth: resolve both paths and require target to live under base_dir."""
        base_real = os.path.realpath(base_dir)
        target_real = os.path.realpath(target)
        try:
            inside = os.path.commonpath([base_real, target_real]) == base_real
        except ValueError:  # Different drives on Windows
            inside = False
        if not inside:
            raise PathTraversalError(f"Refusing to write outside {base_real}: {target_real}")
        return target

class MediaManager:
    downloaded_urls_cache = {}
    KNOWN_PLATFORMS = frozenset({"instagram", "facebook", "twitter", "auto"})
    
    @classmethod
    def check_cache(cls, url, shortcode, dash_manifest, metadata):
        if not url and not dash_manifest:
            return False, {"status": "error", "message": "No URL provided"}
            
        if url:
            cache_key = f"blob_fallback_{shortcode}" if url.startswith("blob:") and shortcode else url
        else:
            shortcode = metadata.get("shortcode")
            cache_key = f"dash_{shortcode}_{metadata.get('index', '0')}"
            
        if cache_key in cls.downloaded_urls_cache:
            last_time = cls.downloaded_urls_cache[cache_key]
            if time.time() - last_time < 3:
                Logger.broadcast_log("STATUS: SKIPPED (URL duplicated within 3s)")
                return False, {"status": "skipped", "message": "Already downloaded in RAM cache"}
                
        cls.downloaded_urls_cache[cache_key] = time.time()
        return True, None

    @staticmethod
    def get_remote_size(check_url):
        if not check_url or check_url.startswith('blob:'): return -1
        try:
            req = urllib.request.Request(check_url, method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=3) as resp:
                return int(resp.getheader('Content-Length', -1))
        except: return -1

    @staticmethod
    def get_out_dir(gallery_dir, platform, username, is_backup, subfolder, is_video, ext):
        if is_backup:
            if subfolder:
                return os.path.join(gallery_dir, "Bandeja_Favoritos", platform, subfolder, username)
            return os.path.join(gallery_dir, "Bandeja_Favoritos", platform, username)
        
        if platform == "facebook":
            media_type_folder = "Videos" if (is_video or ext == "mp4") else "Pictures"
            return os.path.join(gallery_dir, platform, username, media_type_folder)
        return os.path.join(gallery_dir, platform, username)

    @staticmethod
    def generate_filename(filename_template, dt, shortcode, safe_id, ext, idx):
        filename = filename_template
        if "{date:" in filename:
            def date_repl(match): return dt.strftime(match.group(1))
            filename = re.sub(r'\{date:([^}]+)\}', date_repl, filename)
            
        def format_var(match):
            var_name = match.group(1)
            slice_str = match.group(2)
            
            val = ""
            if var_name in ("shortcode", "sidecar_shortcode"): val = shortcode
            elif var_name == "extension": val = ext
            elif var_name == "id": val = safe_id
            elif var_name == "num": val = str(idx) if idx is not None else ""
            
            if slice_str:
                try:
                    length = int(slice_str.strip("[:]"))
                    val = val[:length]
                except: pass
            return val

        filename = re.sub(r'\{(shortcode|extension|id|num)(\[:\d+\])?\}', format_var, filename)
        filename = re.sub(r'\{(sidecar_shortcode)(\[:\d+\])?\}', format_var, filename)
        
        if shortcode and safe_id == shortcode:
            filename = filename.replace(f"_{shortcode}_{shortcode}", f"_{shortcode}")
            filename = filename.replace(f"{shortcode}_{shortcode}", f"{shortcode}")
            
        if idx is not None and str(idx).isdigit() and int(idx) > 0:
            if "{num}" not in filename_template:
                name, dot_ext = os.path.splitext(filename)
                filename = f"{name}_{idx}{dot_ext}"
                
        for char in ['<', '>', ':', '"', '/', '\\', '|', '?', '*']:
            filename = filename.replace(char, '_')
            
        return filename

    @classmethod
    def ensure_unique_filepath(cls, filepath, out_dir, filename, url, is_backup):
        if os.path.exists(filepath):
            if is_backup:
                return filepath, True, {"status": "skipped", "message": "Already downloaded", "log": "File exists", "filename": os.path.basename(filepath)}
            
            remote_size = cls.get_remote_size(url)
            name, dot_ext = os.path.splitext(filename)
            counter = 1
            
            if remote_size > 0 and os.path.getsize(filepath) == remote_size:
                return filepath, True, {"status": "skipped", "filename": os.path.basename(filepath)}
            elif remote_size == -1 and is_backup:
                return filepath, True, {"status": "skipped", "filename": os.path.basename(filepath)}
            
            while True:
                next_filename = f"{name} ({counter}){dot_ext}"
                next_filepath = os.path.join(out_dir, next_filename)
                if not os.path.exists(next_filepath):
                    return next_filepath, False, None
                if remote_size > 0 and os.path.getsize(next_filepath) == remote_size:
                    return next_filepath, True, {"status": "skipped", "filename": next_filename}
                elif remote_size == -1 and is_backup:
                    return next_filepath, True, {"status": "skipped", "filename": next_filename}
                counter += 1
        return filepath, False, None

    @classmethod
    def process_request(cls, msg: Dict[str, Any], platform: str, account: str, mediaType: str = "auto") -> Dict[str, Any]:
        if platform not in cls.KNOWN_PLATFORMS:
            Logger.broadcast_log(f"Rejected request with unknown platform: {platform!r}")
            return {"status": "error", "message": "Unknown platform"}

        # Sanitize once at the entry point: every handler below re-reads direct_metadata from msg.
        raw_metadata = msg.get("direct_metadata") or msg.get("metadata") or {}
        if not isinstance(raw_metadata, dict):
            return {"status": "error", "message": "Invalid metadata"}
        msg = dict(msg, direct_metadata=PathGuard.sanitize_metadata(raw_metadata))

        try:
            return cls._dispatch_request(msg, platform, account, mediaType)
        except PathTraversalError as e:
            Logger.broadcast_log(f"SECURITY: {e}")
            return {"status": "error", "message": "Rejected unsafe output path"}

    @classmethod
    def _dispatch_request(cls, msg: Dict[str, Any], platform: str, account: str, mediaType: str) -> Dict[str, Any]:
        url = msg.get("url")
        metadata = msg.get("direct_metadata") or {}
        dash_manifest = metadata.get("dash_manifest")
        shortcode = metadata.get("shortcode", "")
        
        proceed, err_resp = cls.check_cache(url, shortcode, dash_manifest, metadata)
        if not proceed: return err_resp

        home = os.path.expanduser("~")
        gallery_dir = os.path.join(home, "gallery-dl")
        if not os.path.exists(gallery_dir): os.makedirs(gallery_dir)

        # 1. PFP BOT
        if mediaType == "pfp_bot":
            username = metadata.get("username")
            if not username: return {"status": "error"}
            pfp_script = os.path.join(home, "Downloads", "Carpetas_Mixtas", "Media Downloader", "pfp_downloader.py")
            if not os.path.exists(pfp_script):
                pfp_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pfp_downloader.py")
            bot_cookie = os.path.join(gallery_dir, "cookies_bot_pfp.txt")
            if not os.path.exists(bot_cookie): bot_cookie = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cookies_bot_pfp.txt")
            dest_dir = PathGuard.ensure_inside(gallery_dir, os.path.join(gallery_dir, "instagram", username))

            cmd = [sys.executable, pfp_script, username, bot_cookie, dest_dir]
            CREATE_NO_WINDOW = 0x08000000
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=CREATE_NO_WINDOW, cwd=home, text=True)
            stdout, stderr = process.communicate()
            return {"status": "success", "message": "PFP bot finished", "log": stdout}

        # 2. DIRECT STORY HANDLING
        if mediaType == "direct_story":
            return cls._handle_direct_story(msg, platform, gallery_dir, url, dash_manifest, account)

        # 3. YTDLP / GALLERY-DL HANDLING
        if platform == "instagram":
            return cls._handle_gallery_dl(url, account, gallery_dir, metadata, platform)
        elif platform in ("twitter", "facebook"):
            return cls._handle_ytdlp(url, platform, gallery_dir, metadata, msg)

        return {"status": "error", "message": "Unknown platform"}

    @classmethod
    def _handle_direct_story(cls, msg, platform, gallery_dir, url, dash_manifest, account):
        metadata = msg.get("direct_metadata") or {}
        Logger.broadcast_log(f"Raw metadata received: {json.dumps(metadata)}")
        config_path = os.path.join(gallery_dir, "config.json")
        filename_template = "{date:%Y-%m-%d}_{shortcode}.{extension}"
        
        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    conf = json.load(f)
                    extractor_conf = conf.get("extractor", {})
                    platform_conf = extractor_conf.get(platform, extractor_conf.get("instagram", {}))
                    if "filename" in platform_conf:
                        val = platform_conf["filename"]
                        if isinstance(val, dict):
                            filename_template = val.get("sidecar_shortcode", val.get("", filename_template)) if metadata.get("index") else val.get("", filename_template)
                        elif isinstance(val, str):
                            filename_template = val
            except Exception as e:
                Logger.broadcast_log(f"Failed to read config: {e}")

        username = metadata.get("username", "Direct_Stories")
        timestamp = metadata.get("timestamp", int(time.time()))
        shortcode = metadata.get("shortcode")
        media_id = metadata.get("media_id")
        
        if not shortcode:
            shortcode = str(media_id).split('_')[0] if media_id else str(int(time.time()))

        is_video = metadata.get("is_video", False)
        ext = "mp4" if (dash_manifest or is_video or ".mp4" in str(url) or "video" in str(url)) else "jpg"
        dt = datetime.datetime.fromtimestamp(timestamp)
        
        if shortcode == "profile_pic":
            filename = f"{username}_profile_pic_{dt.strftime('%Y-%m-%d_%H%M%S')}.{ext}"
        else:
            safe_id = str(media_id).split('_')[0] if (media_id and str(media_id).isdigit()) else str(media_id) if media_id else shortcode
            filename = cls.generate_filename(filename_template, dt, shortcode, safe_id, ext, metadata.get("index"))

        is_backup = metadata.get("is_backup", False)
        media_category = metadata.get("media_category", "post")
        subfolder = "" if media_category == "pfp" else media_category

        out_dir = PathGuard.ensure_inside(gallery_dir, cls.get_out_dir(gallery_dir, platform, username, is_backup, subfolder, is_video, ext))
        if not os.path.exists(out_dir): os.makedirs(out_dir)

        user_id = metadata.get("user_id")
        if user_id:
            user_root_dir = os.path.dirname(out_dir) if (out_dir.endswith("Videos") or out_dir.endswith("Pictures")) else out_dir
            id_file_path = os.path.join(user_root_dir, f"ID_{user_id}.txt")
            if not os.path.exists(id_file_path):
                try:
                    with open(id_file_path, "w", encoding="utf-8") as f:
                        f.write(f"Username: {username}\nPermanent ID: {user_id}\nProfile URL: https://www.facebook.com/profile.php?id={user_id}\n")
                except: pass

        filepath = os.path.join(out_dir, filename)
        Logger.broadcast_log(f"--- NEW DIRECT DOWNLOAD REQUEST ---")
        Logger.broadcast_log(f"Target filepath: {filepath}")

        filepath, skipped, skip_res = cls.ensure_unique_filepath(filepath, out_dir, filename, url, is_backup)
        if skipped: return skip_res

        Logger.broadcast_log(f"Direct downloading to: {filepath}")

        if dash_manifest:
            Logger.broadcast_log("DASH manifest found. Using NATIVE yt-dlp.")
            temp_manifest = tempfile.NamedTemporaryFile(delete=False, suffix=".mpd")
            temp_manifest.write(dash_manifest.encode('utf-8'))
            temp_manifest.close()
            manifest_path = temp_manifest.name
            
            import pathlib
            manifest_url = pathlib.Path(manifest_path).as_uri()
            filepath_no_ext = os.path.splitext(filepath)[0]
            
            ydl_opts = {
                'enable_file_urls': True,
                'outtmpl': filepath_no_ext + '.%(ext)s',
                'merge_output_format': 'mp4',
                'updatetime': False  # Previene Error 22 en Windows por fechas de modificación inválidas
            }
            res = DownloaderEngines.execute_ytdlp_native(manifest_url, ydl_opts)
            try: os.remove(manifest_path); os.remove(filepath_no_ext + ".mpd")
            except: pass
            
            if res['status'] == 'success': return res
            
            # Limpiar archivos .part huérfanos generados por fallo de yt-dlp
            try:
                out_dir_path = os.path.dirname(filepath)
                base_name = os.path.basename(filepath_no_ext)
                for f in os.listdir(out_dir_path):
                    if f.startswith(base_name) and f.endswith(".part"):
                        os.remove(os.path.join(out_dir_path, f))
            except: pass

            Logger.broadcast_log("NATIVE DASH fallback failed. Continuing to direct URL fallback...")

        if not url or url.startswith('blob:'):
            fallback_url = None
            if platform == "instagram":
                if shortcode and not shortcode.isdigit(): fallback_url = f"https://www.instagram.com/p/{shortcode}/"
                elif metadata.get("media_id"): fallback_url = f"https://www.instagram.com/stories/{username}/{str(metadata['media_id']).split('_')[0]}/"
            elif platform == "facebook":
                fallback_url = metadata.get("story_url") or (f"https://www.facebook.com/reel/{shortcode}" if shortcode else None)
                    
            if fallback_url:
                Logger.broadcast_log(f"Blob URL detected. Falling back: {fallback_url}")
                msg_copy = dict(msg)
                msg_copy["url"] = fallback_url
                msg_copy["mediaType"] = "auto"
                return cls.process_request(msg_copy, platform, account, "auto")
            return {"status": "error", "message": "Failed DASH download, cannot fallback to blob"}
            
        return DownloaderEngines.execute_direct_http(url, filepath)

    @classmethod
    def _handle_gallery_dl(cls, url: str, account: str, gallery_dir: str, metadata: Dict[str, Any], platform: str) -> Dict[str, Any]:
        # Options only: execute_gallery_dl appends '--' and the URL itself.
        cmd: List[str] = []
        config_path = os.path.join(gallery_dir, "config.json")
        if os.path.exists(config_path): cmd.extend(["--config", config_path])
        
        cookie_file = "www.instagram.com_cookiesM.txt" if account == "M" else "www.instagram.com_cookiesV.txt"
        cookie_path = os.path.join(gallery_dir, cookie_file)
        is_backup = metadata.get("is_backup", False)
        
        if os.path.exists(cookie_path) and not is_backup:
            cmd.extend(["--cookies", cookie_path])
        elif is_backup:
            Logger.broadcast_log("WARNING: Backup mode. Cookies DISABLED.")
            backup_out = PathGuard.ensure_inside(gallery_dir, os.path.join(gallery_dir, "Bandeja_Favoritos", platform, "post", metadata.get("username", "Unknown")))
            cmd.extend(["-d", backup_out])
            
        return DownloaderEngines.execute_gallery_dl(url, cmd)

    @classmethod
    def _handle_ytdlp(cls, url, platform, gallery_dir, metadata, msg):
        actual_url = url
        is_backup = metadata.get("is_backup", False)
        username = metadata.get("username", "Unknown")

        if metadata.get("is_direct"):
            if metadata.get("url"): actual_url = metadata.get("url")
            elif metadata.get("dash_manifest"):
                temp_manifest = tempfile.NamedTemporaryFile(delete=False, suffix=".mpd")
                temp_manifest.write(metadata.get("dash_manifest").encode('utf-8'))
                temp_manifest.close()
                actual_url = temp_manifest.name

        if not actual_url or ("facebook.com" not in actual_url and "fbcdn.net" not in actual_url and not actual_url.startswith("http")):
            if metadata.get("story_url"): actual_url = metadata.get("story_url")

        ydl_opts = {}
        out_dir = os.path.join(gallery_dir, platform.capitalize())

        if metadata.get("is_direct") and metadata.get("tweet_id"):
            ydl_opts['outtmpl'] = os.path.join(out_dir, f"X_{metadata.get('tweet_id')}.%(ext)s")

        if platform == "facebook":
            timestamp = metadata.get("timestamp", int(time.time()))
            shortcode = metadata.get("shortcode", "")
            try: date_str = datetime.datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d')
            except Exception: date_str = datetime.datetime.now().strftime('%Y-%m-%d')
            
            subfolder = "Videos" if metadata.get("mediaType", msg.get("mediaType")) in ["video", "auto"] else "Pictures"
            filename = f"{date_str}_{shortcode}.%(ext)s" if shortcode and shortcode != "story" else f"{date_str}_{timestamp}.%(ext)s"
            
            if is_backup:
                out_dir = os.path.join(gallery_dir, "Bandeja_Favoritos", platform, "post", username)
            else:
                out_dir = os.path.join(gallery_dir, "facebook", username, subfolder)
            ydl_opts['outtmpl'] = os.path.join(out_dir, filename)
        else:
            if 'outtmpl' not in ydl_opts:
                if is_backup: out_dir = os.path.join(gallery_dir, "Bandeja_Favoritos", platform, "post", username)
                ydl_opts['outtmpl'] = os.path.join(out_dir, '%(title)s.%(ext)s')

        if platform == "twitter":
            cookie_path = os.path.join(gallery_dir, "www.x.com_cookies.txt")
            if os.path.exists(cookie_path) and not metadata.get("is_direct"): ydl_opts['cookiefile'] = cookie_path
        elif platform == "facebook":
            cookie_path = os.path.join(gallery_dir, "www.facebook.com_cookies.txt")
            if os.path.exists(cookie_path): ydl_opts['cookiefile'] = cookie_path

        if 'outtmpl' in ydl_opts:
            PathGuard.ensure_inside(gallery_dir, os.path.dirname(ydl_opts['outtmpl']))

        res = DownloaderEngines.execute_ytdlp_native(actual_url, ydl_opts)
        
        if metadata.get("is_direct") and metadata.get("dash_manifest"):
            try: os.remove(actual_url)
            except: pass
            
        return res

def _with_request_id(result: Dict[str, Any], request_id: Any) -> Dict[str, Any]:
    """The extension routes each result to the tab that asked for it by this id."""
    if isinstance(request_id, str) and request_id:
        return dict(result, request_id=request_id)
    return result

def main() -> None:
    EnvironmentSetup.inject_paths()
    tcp_server = TCPServer()
    tcp_server.start()
    # Lets the extension flush requests it queued while this process was starting.
    NativeMessaging.send_message({"action": "host_ready"})

    while True:
        msg: Dict[str, Any] = {}
        try:
            msg = NativeMessaging.get_message()
            if "url" in msg:
                mediaType = msg.get("mediaType", "auto")
                result = MediaManager.process_request(msg, msg.get("platform", "auto"), msg.get("account", "M"), mediaType)
                NativeMessaging.send_message(_with_request_id(result, msg.get("request_id")))
            elif "status" in msg and msg.get("action") == "backup_log":
                Logger.broadcast_log(msg.get("message", ""))
            else:
                Logger.log_info(f"Ignored native message without url/action: {list(msg.keys())}")
        except Exception as e:
            # Last-resort isolation: one bad request must never kill the host loop.
            Logger.log_info(f"Unhandled error while processing request: {e!r}")
            NativeMessaging.send_message(_with_request_id({"status": "error", "message": str(e)}, msg.get("request_id")))

if __name__ == '__main__':
    main()
