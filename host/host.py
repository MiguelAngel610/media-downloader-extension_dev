import sys
import json
import struct
import subprocess
import os
import time
import datetime
import re
import urllib.request

# Automatically inject Python Scripts folder into PATH to find yt-dlp and gallery-dl
_scripts_dir = os.path.join(os.path.dirname(sys.executable), "Scripts")
if os.path.exists(_scripts_dir) and _scripts_dir not in os.environ.get("PATH", ""):
    os.environ["PATH"] = _scripts_dir + os.pathsep + os.environ.get("PATH", "")

# Automatically discover FFmpeg from WinGet packages and inject into PATH
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

# Chrome Native Messaging requires reading a 32-bit integer for message length
def get_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        sys.exit(0)
    message_length = struct.unpack('@I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message)

# Encode message to send back to Chrome
def send_message(message_content):
    encoded_content = json.dumps(message_content).encode('utf-8')
    encoded_length = struct.pack('@I', len(encoded_content))
    sys.stdout.buffer.write(encoded_length)
    sys.stdout.buffer.write(encoded_content)
    sys.stdout.buffer.flush()

import socket
import threading

active_tcp_clients = []

def tcp_server_thread():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        server.bind(('127.0.0.1', 65432))
        server.listen(5)
        log_info("TCP Server started on port 65432")
    except Exception as e:
        log_info(f"Failed to start TCP Server: {e}")
        return
        
    while True:
        try:
            client, addr = server.accept()
            threading.Thread(target=handle_tcp_client, args=(client,), daemon=True).start()
        except Exception as e:
            log_info(f"TCP Accept Error: {e}")

def handle_tcp_client(client):
    active_tcp_clients.append(client)
    try:
        while True:
            data = client.recv(4096)
            if not data:
                break
            message = data.decode('utf-8').strip()
            if message:
                try:
                    msg_json = json.loads(message)
                    send_message(msg_json) # Send command from Python GUI directly to Chrome Extension
                except Exception as e:
                    log_info(f"TCP JSON parse error: {e}")
    except Exception as e:
        log_info(f"TCP Client Error: {e}")
    finally:
        if client in active_tcp_clients:
            active_tcp_clients.remove(client)
        client.close()

def broadcast_log(msg):
    log_info(msg)
    for client in list(active_tcp_clients):
        try:
            client.sendall((str(msg) + "\n").encode('utf-8', errors='replace'))
        except:
            pass

def log_info(msg):
    try:
        log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "host.log")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(str(msg) + "\n")
    except:
        pass

downloaded_urls_cache = set()

def download_media(msg, platform, account, mediaType="auto"):
    global downloaded_urls_cache
    
    url = msg.get("url")
    metadata = msg.get("direct_metadata") or msg.get("metadata") or {}
    dash_manifest = metadata.get("dash_manifest")
    
    if not url and not dash_manifest:
        return {"status": "error", "message": "No URL provided"}
        
    # Generate a unique cache key
    shortcode = metadata.get("shortcode", "")
    if url:
        cache_key = f"blob_fallback_{shortcode}" if url.startswith("blob:") and shortcode else url
    else:
        cache_key = f"dash_{shortcode}_{metadata.get('index', '0')}"
        
    # ANTI-DUPLICATION CACHE
    if cache_key in downloaded_urls_cache:
        broadcast_log("STATUS: SKIPPED (URL already downloaded in this session)")
        return {"status": "skipped", "message": "Already downloaded in RAM cache", "log": "Duplicated URL ignored"}
    downloaded_urls_cache.add(cache_key)
    
    try:
        home = os.path.expanduser("~")
        
        if mediaType == "direct_story":
            # Default gallery-dl folder structure
            gallery_dir = os.path.join(home, "gallery-dl")
            config_path = os.path.join(gallery_dir, "config.json")
            filename_template = "{date:%Y-%m-%d}_{shortcode}.{extension}"
            
            if os.path.exists(config_path):
                try:
                    with open(config_path, "r", encoding="utf-8") as f:
                        conf = json.load(f)
                        extractor_conf = conf.get("extractor", {})
                        
                        # Use platform-specific config if available, fallback to instagram
                        platform_conf = extractor_conf.get(platform, extractor_conf.get("instagram", {}))
                        
                        if "filename" in platform_conf:
                            val = platform_conf["filename"]
                            if isinstance(val, dict):
                                # If it's a carousel (has index), try to use sidecar_shortcode template first
                                idx_val = metadata.get("index")
                                if idx_val:
                                    filename_template = val.get("sidecar_shortcode", val.get("", "{date:%Y-%m-%d}_{shortcode}.{extension}"))
                                else:
                                    filename_template = val.get("", "{date:%Y-%m-%d}_{shortcode}.{extension}")
                            elif isinstance(val, str):
                                filename_template = val
                except Exception as e:
                    broadcast_log(f"Failed to read config: {e}")
            metadata = msg.get("direct_metadata") or {}
            username = metadata.get("username") or "Direct_Stories"
            timestamp = metadata.get("timestamp") or int(time.time())
            shortcode = metadata.get("shortcode") or str(int(time.time()))
            
            dash_manifest = metadata.get("dash_manifest")
            is_video = metadata.get("is_video", False)
            
            if dash_manifest or is_video or ".mp4" in url or "video" in url:
                ext = "mp4"
            else:
                ext = "jpg"
            
            # Format filename matching gallery-dl syntax
            dt = datetime.datetime.fromtimestamp(timestamp)
            
            # ENFORCE SPECIAL FORMAT FOR PROFILE PICS
            if shortcode == "profile_pic":
                filename = f"{username}_profile_pic_{dt.strftime('%Y-%m-%d_%H%M%S')}.{ext}"
            else:
                filename = filename_template
                if "{date:" in filename:
                    def date_repl(match):
                        fmt = match.group(1)
                        return dt.strftime(fmt)
                    filename = re.sub(r'\{date:([^}]+)\}', date_repl, filename)
                
                media_id = metadata.get("media_id")
                safe_id = str(media_id).split('_')[0] if (media_id and str(media_id).isdigit()) else str(media_id) if media_id else shortcode
                
                # Support gallery-dl variable slicing, e.g. {shortcode[:11]} or {id[:15]}
                def format_var(match):
                    var_name = match.group(1)
                    slice_str = match.group(2)
                    
                    val = ""
                    if var_name == "shortcode" or var_name == "sidecar_shortcode": val = shortcode
                    elif var_name == "extension": val = ext
                    elif var_name == "id": val = safe_id
                    elif var_name == "num": val = str(metadata.get("index", ""))
                    
                    if slice_str:
                        try:
                            # slice_str is something like "[:11]"
                            length = int(slice_str.strip("[:]"))
                            val = val[:length]
                        except:
                            pass
                    return val

                filename = re.sub(r'\{(shortcode|extension|id|num)(\[:\d+\])?\}', format_var, filename)
                
                filename = re.sub(r'\{(sidecar_shortcode)(\[:\d+\])?\}', format_var, filename)
                
                idx = metadata.get("index")
                if idx is not None and str(idx).isdigit() and int(idx) > 0:
                    # Only append _idx if {num} wasn't already evaluated in the template
                    if "{num}" not in filename_template:
                        name, dot_ext = os.path.splitext(filename)
                        filename = f"{name}_{idx}{dot_ext}"
            
            # Ensure safe filename
            for char in ['<', '>', ':', '"', '/', '\\', '|', '?', '*']:
                filename = filename.replace(char, '_')
                
            is_backup = metadata.get("is_backup", False)
            media_category = metadata.get("media_category", "post") # Default to post if not provided
            
            # Sub-folder is usually just the category (post or story)
            if media_category == "pfp":
                subfolder = "" # PFP goes directly in user folder
            else:
                subfolder = media_category

            if is_backup:
                # BACKUP ROUTING: Segregate into post/story inside Bandeja_Favoritos
                if subfolder:
                    out_dir = os.path.join(gallery_dir, "Bandeja_Favoritos", platform, subfolder, username)
                else:
                    out_dir = os.path.join(gallery_dir, "Bandeja_Favoritos", platform, username)
            else:
                # MANUAL ROUTING (Extension)
                if platform == "facebook":
                    media_type_folder = "Videos" if (is_video or ext == "mp4") else "Pictures"
                    out_dir = os.path.join(gallery_dir, platform, username, media_type_folder)
                else:
                    out_dir = os.path.join(gallery_dir, platform, username)
                
            if not os.path.exists(out_dir):
                os.makedirs(out_dir)
                
            # Create Notepad with Permanent ID if available
            user_id = metadata.get("user_id")
            if user_id:
                # Always put the notepad in the root user directory, not inside Videos/Pictures
                user_root_dir = os.path.dirname(out_dir) if (out_dir.endswith("Videos") or out_dir.endswith("Pictures")) else out_dir
                id_file_path = os.path.join(user_root_dir, f"ID_{user_id}.txt")
                if not os.path.exists(id_file_path):
                    try:
                        with open(id_file_path, "w", encoding="utf-8") as f:
                            f.write(f"Username: {username}\n")
                            f.write(f"Permanent ID: {user_id}\n")
                            f.write(f"Profile URL: https://www.facebook.com/profile.php?id={user_id}\n")
                    except Exception as e:
                        broadcast_log(f"Failed to create ID notepad: {e}")

            filepath = os.path.join(out_dir, filename)
            
            broadcast_log(f"--- NEW DIRECT DOWNLOAD REQUEST ---")
            broadcast_log(f"URL: {url}")
            broadcast_log(f"Target filepath: {filepath}")
            
            # Function to get remote file size
            def get_remote_size(check_url):
                if not check_url or check_url.startswith('blob:'): return -1
                try:
                    req = urllib.request.Request(check_url, method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req, timeout=3) as resp:
                        return int(resp.getheader('Content-Length', -1))
                except: return -1
            
            # Check collisions
            if os.path.exists(filepath):
                if is_backup:
                    broadcast_log("STATUS: SKIPPED (File exists, skipping size check for Backup)")
                    return {"status": "skipped", "message": "Already downloaded", "log": f"File exists: {filepath}"}
                
                remote_size = get_remote_size(url)
                name, dot_ext = os.path.splitext(filename)
                counter = 1
                
                # Check the base file first
                if remote_size > 0 and os.path.getsize(filepath) == remote_size:
                    broadcast_log("STATUS: SKIPPED (File exists with same size)")
                    return {"status": "skipped", "message": "Already downloaded", "log": f"File exists: {filepath}"}
                elif remote_size == -1 and is_backup:
                    broadcast_log("STATUS: SKIPPED (File exists, assuming duplicate for Backup)")
                    return {"status": "skipped", "message": "Already downloaded", "log": f"File exists: {filepath}"}
                
                # Auto-increment until we find a free slot or a matching size
                while True:
                    next_filename = f"{name} ({counter}){dot_ext}"
                    next_filepath = os.path.join(out_dir, next_filename)
                    if not os.path.exists(next_filepath):
                        filename = next_filename
                        filepath = next_filepath
                        break
                    if remote_size > 0 and os.path.getsize(next_filepath) == remote_size:
                        broadcast_log("STATUS: SKIPPED (File exists with same size)")
                        return {"status": "skipped", "message": "Already downloaded", "log": f"File exists: {next_filepath}"}
                    elif remote_size == -1 and is_backup:
                        broadcast_log("STATUS: SKIPPED (File exists, assuming duplicate for Backup)")
                        return {"status": "skipped", "message": "Already downloaded", "log": f"File exists: {next_filepath}"}
                    counter += 1
            
            broadcast_log(f"Direct downloading story to: {filepath}")
            
            if dash_manifest:
                import tempfile
                
                broadcast_log("DASH manifest found. Using yt-dlp to download highest quality (including 60fps).")
                temp_dir = tempfile.gettempdir()
                manifest_filename = f"dash_{shortcode}.mpd"
                manifest_path = os.path.join(temp_dir, manifest_filename)
                with open(manifest_path, "w", encoding="utf-8") as f:
                    f.write(dash_manifest)
                
                manifest_url = "file:///" + manifest_path.replace("\\", "/")
                # Strip extension from output path — yt-dlp adds its own
                filepath_no_ext = os.path.splitext(filepath)[0]
                cmd = ["yt-dlp", manifest_url, "--enable-file-urls", "-o", filepath_no_ext + ".%(ext)s", "--merge-output-format", "mp4"]
                try:
                    CREATE_NO_WINDOW = 0x08000000
                    process = subprocess.Popen(
                        cmd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        creationflags=CREATE_NO_WINDOW,
                        cwd=temp_dir,
                        text=True,
                        shell=True
                    )
                    stdout, stderr = process.communicate()
                    
                    try:
                        os.remove(manifest_path)
                        # yt-dlp copies the mpd to the output directory because we passed it as the URL, let's clean it up
                        out_mpd = filepath_no_ext + ".mpd"
                        if os.path.exists(out_mpd):
                            os.remove(out_mpd)
                    except:
                        pass
                    
                    if process.returncode == 0:
                        actual_file = filepath_no_ext + ".mp4"
                        if os.path.exists(actual_file) or os.path.exists(filepath):
                            broadcast_log("STATUS: SUCCESS (DASH yt-dlp)")
                            return {"status": "success", "message": "Downloaded via DASH", "log": stdout}
                    else:
                        broadcast_log(f"DASH download failed: {stderr}. Falling back to progressive.")
                except Exception as e:
                    broadcast_log(f"yt-dlp not found or failed: {e}. Falling back to progressive MP4.")
                    try: os.remove(manifest_path)
                    except: pass
            
            if not url or url.startswith('blob:'):
                # Last resort: use gallery-dl / yt-dlp with the post URL
                fallback_url = None
                if platform == "instagram":
                    if shortcode and not shortcode.isdigit():
                        fallback_url = f"https://www.instagram.com/p/{shortcode}/"
                    elif metadata.get("media_id"):
                        mid = str(metadata["media_id"]).split("_")[0]
                        fallback_url = f"https://www.instagram.com/stories/{username}/{mid}/"
                elif platform == "facebook":
                    if metadata.get("story_url"):
                        fallback_url = metadata.get("story_url")
                    elif shortcode:
                        fallback_url = f"https://www.facebook.com/reel/{shortcode}"
                        
                if fallback_url:
                    broadcast_log(f"Blob URL detected. Falling back to yt-dlp/gallery-dl: {fallback_url}")
                    # Switch to auto mode
                    msg_copy = dict(msg)
                    msg_copy["url"] = fallback_url
                    msg_copy["mediaType"] = "auto"
                    return download_media(msg_copy, platform, account, "auto")
                else:
                    broadcast_log("URL is a blob. No fallback available.")
                    return {"status": "error", "message": "Failed DASH download, cannot fallback to blob", "log": "Blob URL"}
                
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
            with urllib.request.urlopen(req, timeout=15) as response, open(filepath, 'wb') as out_file:
                out_file.write(response.read())
                
            broadcast_log("STATUS: SUCCESS (Direct)")
            return {"status": "success", "message": "Downloaded via direct HTTP", "log": f"Saved to {filepath}"}
            

        elif mediaType == "pfp_bot":
            metadata = msg.get("direct_metadata") or {}
            username = metadata.get("username")
            if not username:
                return {"status": "error", "message": "No username provided for PFP download"}
            
            pfp_script = os.path.join(home, "Downloads", "Carpetas_Mixtas", "Media Downloader", "pfp_downloader.py")
            bot_cookie = os.path.join(home, "gallery-dl", "cookies_bot_pfp.txt")
            if not os.path.exists(bot_cookie):
                bot_cookie = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cookies_bot_pfp.txt")
            dest_dir = os.path.join(home, "gallery-dl", "instagram", username)
            
            if not os.path.exists(pfp_script):
                return {"status": "error", "message": f"pfp_downloader.py not found at {pfp_script}"}
                
            cmd = [sys.executable, pfp_script, username, bot_cookie, dest_dir]
            broadcast_log(f"Executing PFP bot: {' '.join(cmd)}")
            
            CREATE_NO_WINDOW = 0x08000000
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=CREATE_NO_WINDOW,
                cwd=home,
                text=True
            )
            stdout, stderr = process.communicate()
            broadcast_log(f"PFP Bot stdout: {stdout}")
            if stderr:
                broadcast_log(f"PFP Bot stderr: {stderr}")
            
            return {"status": "success", "message": "PFP download completed via Bot", "log": stdout}
        
        # Carpeta base de gallery-dl del usuario
        gallery_dir = os.path.join(home, "gallery-dl")
        if not os.path.exists(gallery_dir):
            os.makedirs(gallery_dir)
            
        cmd = ["gallery-dl", url]
        
        if platform == "instagram":
            # Usar archivo de configuración si existe
            config_path = os.path.join(gallery_dir, "config.json")
            if os.path.exists(config_path):
                cmd.extend(["--config", config_path])
                
            # Elegir cookie según la cuenta
            cookie_file = "www.instagram.com_cookiesM.txt" if account == "M" else "www.instagram.com_cookiesV.txt"
            cookie_path = os.path.join(gallery_dir, cookie_file)
            
            # PROTECCIÓN ANTI-BAN: Si venimos de un "backup" invisible, prohibir estrictamente el uso de cookies
            metadata = msg.get("direct_metadata") or {}
            is_backup = metadata.get("is_backup", False)
            username = metadata.get("username", "Unknown")
            
            if os.path.exists(cookie_path) and not is_backup:
                cmd.extend(["--cookies", cookie_path])
            elif is_backup:
                broadcast_log("WARNING: Gallery-dl fallback invoked during an Auto-Backup. Cookies are DISABLED to ensure 100% invisibility.")
            
            # FIX: Si es backup, obligar a gallery-dl a escupir en Bandeja_Favoritos (sobreescribiendo config.json)
            if is_backup:
                backup_out = os.path.join(gallery_dir, "Bandeja_Favoritos", platform, "post", username)
                cmd.extend(["-d", backup_out])
            
        elif platform == "twitter" or platform == "facebook":
            # Para X y FB usamos yt-dlp normalmente
            metadata = msg.get("direct_metadata") or {}
            is_backup = metadata.get("is_backup", False)
            username = metadata.get("username", "Unknown")
            
            # If the extension intercepted the raw MP4 URL or DASH manifest, we use it!
            actual_url = url
            temp_manifest = None
            if metadata.get("is_direct"):
                if metadata.get("url"):
                    actual_url = metadata.get("url")
                elif metadata.get("dash_manifest"):
                    import tempfile
                    # Write dash manifest to temp file so yt-dlp can parse it
                    temp_manifest = tempfile.NamedTemporaryFile(delete=False, suffix=".mpd")
                    temp_manifest.write(metadata.get("dash_manifest").encode('utf-8'))
                    temp_manifest.close()
                    actual_url = temp_manifest.name
            
            # Fix: If the extension sent the raw ID as the url (fallback), use the full story_url for yt-dlp instead
            if "facebook.com" not in actual_url and "fbcdn.net" not in actual_url and not actual_url.startswith("http"):
                if metadata.get("story_url"):
                    actual_url = metadata.get("story_url")
            
            cmd = ["yt-dlp", actual_url]
            
            if metadata.get("is_direct") and metadata.get("tweet_id"):
                cmd.extend(["-o", f"X_{metadata.get('tweet_id')}.%(ext)s"])
                
            if metadata.get("is_direct") and platform == "facebook":
                timestamp = metadata.get("timestamp", int(time.time()))
                shortcode = metadata.get("shortcode", "")
                
                # Convert timestamp to YYYY-MM-DD
                try:
                    date_str = datetime.datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d')
                except Exception:
                    date_str = datetime.datetime.now().strftime('%Y-%m-%d')
                
                subfolder = "Videos" if metadata.get("mediaType", msg.get("mediaType")) in ["video", "auto"] else "Pictures"
                filename = f"{date_str}_{shortcode}.%(ext)s" if shortcode and shortcode != "story" else f"{date_str}_{timestamp}.%(ext)s"
                
                cmd.extend(["-o", os.path.join(gallery_dir, "facebook", username, subfolder, filename)])
                
            if platform == "twitter":
                cookie_path = os.path.join(gallery_dir, "www.x.com_cookies.txt")
                if os.path.exists(cookie_path) and not metadata.get("is_direct"):
                    cmd.extend(["--cookies", cookie_path])
            elif platform == "facebook":
                # Do NOT use cookies for facebook by default because yt-dlp will hang due to Chrome SQLite lock.
                # Only use a custom cookie file if the user exported it manually.
                cookie_path = os.path.join(gallery_dir, "www.facebook.com_cookies.txt")
                if os.path.exists(cookie_path):
                    cmd.extend(["--cookies", cookie_path])
            
            # Si es backup, forzar a Bandeja_Favoritos
            if is_backup:
                backup_out = os.path.join(gallery_dir, "Bandeja_Favoritos", platform, "post", username)
                cmd.extend(["-P", backup_out])
            elif not (metadata.get("is_direct") and platform == "facebook"):
                cmd.extend(["-P", os.path.join(gallery_dir, platform.capitalize())])
            
        broadcast_log(f"Executing: {' '.join(cmd)}")
        
        # We start the process without waiting so the extension UI doesn't block infinitely,
        # but for simplicity we wait here (extension has a 5min timeout for native messaging usually).
        # We will run it with CREATE_NO_WINDOW so no console pops up
        CREATE_NO_WINDOW = 0x08000000
        
        # Need shell=True on windows if gallery-dl is a .cmd or .bat in Scripts, 
        # but normally python scripts wrappers work without it if we pass full executable name.
        # Let's try shell=True to ensure gallery-dl is found in PATH.
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=CREATE_NO_WINDOW,
            cwd=home,
            text=True,
            shell=True
        )
        
        try:
            stdout, stderr = process.communicate(timeout=45)
        except subprocess.TimeoutExpired:
            process.kill()
            stdout, stderr = process.communicate()
            stderr += "\n\nError: Download timed out after 45 seconds."
        
        broadcast_log(f"Return code: {process.returncode}")
        if stdout: broadcast_log(f"STDOUT: {stdout}")
        if stderr: broadcast_log(f"STDERR: {stderr}")
        
        output_lower = (stdout + stderr).lower()
        if process.returncode == 0:
            if is_skipped(stdout + stderr):
                broadcast_log("STATUS: SKIPPED")
                return {"status": "skipped", "message": "Already downloaded", "log": stdout}
            
            # Clean up temporary manifest
            if temp_manifest and os.path.exists(temp_manifest.name):
                try:
                    os.remove(temp_manifest.name)
                except:
                    pass
                
            broadcast_log("STATUS: SUCCESS")
            return {"status": "success", "message": f"{platform.capitalize()} downloaded successfully (using yt-dlp)", "log": stdout}
        else:
            broadcast_log("STATUS: ERROR")
            # Clean up temporary manifest
            if temp_manifest and os.path.exists(temp_manifest.name):
                try:
                    os.remove(temp_manifest.name)
                except:
                    pass
            return {"status": "error", "message": "Download failed", "log": stderr}
            
    except Exception as e:
        broadcast_log(f"Exception: {str(e)}")
        return {"status": "error", "message": str(e)}

def is_skipped(text):
    if not text:
        return False
    text_lower = text.lower()
    if "already exists" in text_lower or "skip" in text_lower:
        return True
    
    # gallery-dl outputs "# /path/to/file" when skipping due to archive
    # ANSI escape codes might wrap the '#', so we check if '#' is the first non-whitespace, non-escape char
    for line in text.split('\n'):
        # Remove ANSI color codes
        import re
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        clean_line = ansi_escape.sub('', line).strip()
        if clean_line.startswith('#'):
            return True
    return False

def main():
    threading.Thread(target=tcp_server_thread, daemon=True).start()
    while True:
        try:
            msg = get_message()
            if "url" in msg:
                mediaType = msg.get("mediaType", "auto")
                result = download_media(msg, msg.get("platform", "auto"), msg.get("account", "M"), mediaType)
                send_message(result)
            elif "status" in msg and msg.get("action") == "backup_log":
                # Forward logs from background.js to TCP GUI
                broadcast_log(msg.get("message", ""))
            else:
                send_message({"status": "error", "message": "No URL provided"})
        except Exception as e:
            send_message({"status": "error", "message": str(e)})

if __name__ == '__main__':
    main()
