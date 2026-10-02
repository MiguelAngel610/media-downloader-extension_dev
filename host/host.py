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

    @staticmethod
    def send_message(message_content):
        encoded_content = json.dumps(message_content).encode('utf-8')
        encoded_length = struct.pack('@I', len(encoded_content))
        sys.stdout.buffer.write(encoded_length)
        sys.stdout.buffer.write(encoded_content)
        sys.stdout.buffer.flush()

class Logger:
    active_tcp_clients = []
    
    @classmethod
    def broadcast_log(cls, msg):
        cls.log_info(msg)
        for client in list(cls.active_tcp_clients):
            try:
                client.sendall((str(msg) + "\n").encode('utf-8', errors='replace'))
            except:
                pass

    @staticmethod
    def log_info(msg):
        try:
            log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "host.log")
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(str(msg) + "\n")
        except:
            pass

class TCPServer:
    def __init__(self, host='127.0.0.1', port=65432):
        self.host = host
        self.port = port
        
    def start(self):
        threading.Thread(target=self._server_thread, daemon=True).start()
        
    def _server_thread(self):
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            server.bind((self.host, self.port))
            server.listen(5)
            Logger.log_info(f"TCP Server started on port {self.port}")
        except Exception as e:
            Logger.log_info(f"Failed to start TCP Server: {e}")
            return
            
        while True:
            try:
                client, addr = server.accept()
                threading.Thread(target=self._handle_client, args=(client,), daemon=True).start()
            except Exception as e:
                Logger.log_info(f"TCP Accept Error: {e}")

    def _handle_client(self, client):
        Logger.active_tcp_clients.append(client)
        try:
            while True:
                data = client.recv(4096)
                if not data:
                    break
                message = data.decode('utf-8').strip()
                if message:
                    try:
                        msg_json = json.loads(message)
                        NativeMessaging.send_message(msg_json)
                    except Exception as e:
                        Logger.log_info(f"TCP JSON parse error: {e}")
        except Exception as e:
            Logger.log_info(f"TCP Client Error: {e}")
        finally:
            if client in Logger.active_tcp_clients:
                Logger.active_tcp_clients.remove(client)
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
            
    @staticmethod
    def execute_gallery_dl(url, cmd_args):
        Logger.broadcast_log(f"Executing gallery-dl: {' '.join(cmd_args)}")
        CREATE_NO_WINDOW = 0x08000000
        process = subprocess.Popen(cmd_args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, 
                                   creationflags=CREATE_NO_WINDOW, cwd=os.path.expanduser("~"), text=True, shell=True)
        try: 
            stdout, stderr = process.communicate(timeout=45)
        except subprocess.TimeoutExpired:
            process.kill()
            stdout, stderr = process.communicate()
        
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

class MediaManager:
    downloaded_urls_cache = {}
    
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
    def process_request(cls, msg, platform, account, mediaType="auto"):
        url = msg.get("url")
        metadata = msg.get("direct_metadata") or msg.get("metadata") or {}
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
            dest_dir = os.path.join(gallery_dir, "instagram", username)
            
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

        out_dir = cls.get_out_dir(gallery_dir, platform, username, is_backup, subfolder, is_video, ext)
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
    def _handle_gallery_dl(cls, url, account, gallery_dir, metadata, platform):
        cmd = ["gallery-dl", url]
        config_path = os.path.join(gallery_dir, "config.json")
        if os.path.exists(config_path): cmd.extend(["--config", config_path])
        
        cookie_file = "www.instagram.com_cookiesM.txt" if account == "M" else "www.instagram.com_cookiesV.txt"
        cookie_path = os.path.join(gallery_dir, cookie_file)
        is_backup = metadata.get("is_backup", False)
        
        if os.path.exists(cookie_path) and not is_backup:
            cmd.extend(["--cookies", cookie_path])
        elif is_backup:
            Logger.broadcast_log("WARNING: Backup mode. Cookies DISABLED.")
            backup_out = os.path.join(gallery_dir, "Bandeja_Favoritos", platform, "post", metadata.get("username", "Unknown"))
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
                
        res = DownloaderEngines.execute_ytdlp_native(actual_url, ydl_opts)
        
        if metadata.get("is_direct") and metadata.get("dash_manifest"):
            try: os.remove(actual_url)
            except: pass
            
        return res

def main():
    EnvironmentSetup.inject_paths()
    tcp_server = TCPServer()
    tcp_server.start()
    
    while True:
        try:
            msg = NativeMessaging.get_message()
            if "url" in msg:
                mediaType = msg.get("mediaType", "auto")
                result = MediaManager.process_request(msg, msg.get("platform", "auto"), msg.get("account", "M"), mediaType)
                NativeMessaging.send_message(result)
            elif "status" in msg and msg.get("action") == "backup_log":
                Logger.broadcast_log(msg.get("message", ""))
            else:
                NativeMessaging.send_message({"status": "error", "message": "No URL provided"})
        except Exception as e:
            NativeMessaging.send_message({"status": "error", "message": str(e)})

if __name__ == '__main__':
    main()
