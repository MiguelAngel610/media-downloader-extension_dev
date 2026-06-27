import sys
import json
import struct
import subprocess
import os

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

def log_info(msg):
    log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "host.log")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(msg + "\n")

def download_media(msg, platform, account, mediaType="auto"):
    try:
        url = msg.get("url", "")
        home = os.path.expanduser("~")
        
        if mediaType == "direct_story":
            import urllib.request
            import time
            import datetime
            import re
            
            # Default gallery-dl folder structure
            gallery_dir = os.path.join(home, "gallery-dl")
            config_path = os.path.join(gallery_dir, "config.json")
            filename_template = "{date:%Y-%m-%d}_{shortcode}.{extension}"
            
            if os.path.exists(config_path):
                try:
                    with open(config_path, "r", encoding="utf-8") as f:
                        conf = json.load(f)
                        ig_conf = conf.get("extractor", {}).get("instagram", {})
                        if "filename" in ig_conf:
                            filename_template = ig_conf["filename"]
                except Exception as e:
                    log_info(f"Failed to read config: {e}")

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
            filename = filename_template
            
            if "{date:" in filename:
                def date_repl(match):
                    fmt = match.group(1)
                    return dt.strftime(fmt)
                filename = re.sub(r'\{date:([^}]+)\}', date_repl, filename)
            
            media_id = metadata.get("media_id")
            safe_id = str(media_id).split('_')[0] if (media_id and str(media_id).isdigit()) else str(media_id) if media_id else shortcode
            
            filename = filename.replace("{shortcode}", shortcode)
            filename = filename.replace("{extension}", ext)
            filename = filename.replace("{id}", safe_id)
            
            # Ensure safe filename
            for char in ['<', '>', ':', '"', '/', '\\', '|', '?', '*']:
                filename = filename.replace(char, '_')
                
            out_dir = os.path.join(gallery_dir, "instagram", username)
            if not os.path.exists(out_dir):
                os.makedirs(out_dir)
                
            filepath = os.path.join(out_dir, filename)
            
            log_info(f"--- NEW DIRECT DOWNLOAD REQUEST ---")
            log_info(f"URL: {url}")
            log_info(f"Target filepath: {filepath}")
            
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
                remote_size = get_remote_size(url)
                name, dot_ext = os.path.splitext(filename)
                counter = 1
                
                # Check the base file first
                if remote_size > 0 and os.path.getsize(filepath) == remote_size:
                    log_info("STATUS: SKIPPED (File exists with same size)")
                    return {"status": "skipped", "message": "Already downloaded", "log": f"File exists: {filepath}"}
                
                # Auto-increment until we find a free slot or a matching size
                while True:
                    next_filename = f"{name}_{counter}{dot_ext}"
                    next_filepath = os.path.join(out_dir, next_filename)
                    if not os.path.exists(next_filepath):
                        filename = next_filename
                        filepath = next_filepath
                        break
                    if remote_size > 0 and os.path.getsize(next_filepath) == remote_size:
                        log_info("STATUS: SKIPPED (File exists with same size)")
                        return {"status": "skipped", "message": "Already downloaded", "log": f"File exists: {next_filepath}"}
                    counter += 1
            
            log_info(f"Direct downloading story to: {filepath}")
            
            if dash_manifest:
                import tempfile
                
                log_info("DASH manifest found. Using yt-dlp to download highest quality (including 60fps).")
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
                            log_info("STATUS: SUCCESS (DASH yt-dlp)")
                            return {"status": "success", "message": "Downloaded via DASH", "log": stdout}
                    else:
                        log_info(f"DASH download failed: {stderr}. Falling back to progressive.")
                except Exception as e:
                    log_info(f"yt-dlp not found or failed: {e}. Falling back to progressive MP4.")
                    try: os.remove(manifest_path)
                    except: pass
            
            if url.startswith('blob:'):
                # Last resort: use gallery-dl with the post URL
                fallback_url = None
                if shortcode and not shortcode.isdigit():
                    fallback_url = f"https://www.instagram.com/p/{shortcode}/"
                elif metadata.get("media_id"):
                    mid = str(metadata["media_id"]).split("_")[0]
                    fallback_url = f"https://www.instagram.com/stories/{username}/{mid}/"
                
                if fallback_url:
                    log_info(f"Blob URL detected. Falling back to gallery-dl: {fallback_url}")
                    # Switch to gallery-dl auto mode
                    msg_copy = dict(msg)
                    msg_copy["url"] = fallback_url
                    msg_copy["mediaType"] = "auto"
                    return download_media(msg_copy, platform, account, "auto")
                else:
                    log_info("URL is a blob. No fallback available.")
                    return {"status": "error", "message": "Failed DASH download, cannot fallback to blob", "log": "Blob URL"}
                
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
            with urllib.request.urlopen(req) as response, open(filepath, 'wb') as out_file:
                out_file.write(response.read())
                
            log_info("STATUS: SUCCESS (Direct)")
            return {"status": "success", "message": "Downloaded via direct HTTP", "log": f"Saved to {filepath}"}
            
        elif mediaType == "pfp_bot":
            metadata = msg.get("direct_metadata") or {}
            username = metadata.get("username")
            if not username:
                return {"status": "error", "message": "No username provided for PFP download"}
            
            pfp_script = os.path.join(home, "Downloads", "Media Downloader", "pfp_downloader.py")
            bot_cookie = os.path.join(home, "gallery-dl", "cookies_bot_pfp.txt")
            if not os.path.exists(bot_cookie):
                bot_cookie = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cookies_bot_pfp.txt")
            dest_dir = os.path.join(home, "gallery-dl", "instagram", username)
            
            if not os.path.exists(pfp_script):
                return {"status": "error", "message": f"pfp_downloader.py not found at {pfp_script}"}
                
            cmd = [sys.executable, pfp_script, username, bot_cookie, dest_dir]
            log_info(f"Executing PFP bot: {' '.join(cmd)}")
            
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
            log_info(f"PFP Bot stdout: {stdout}")
            if stderr:
                log_info(f"PFP Bot stderr: {stderr}")
            
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
            
            if os.path.exists(cookie_path):
                cmd.extend(["--cookies", cookie_path])
            
            # Ya no forzamos -d, dejamos que gallery-dl use su config.json y lo ordene por usuarios
            
        elif platform == "twitter" or platform == "facebook":
            # Para X y FB usamos yt-dlp normalmente
            metadata = msg.get("direct_metadata") or {}
            
            # If the extension intercepted the raw MP4 URL, we use it directly!
            actual_url = metadata.get("url") if metadata.get("is_direct") else url
            cmd = ["yt-dlp", actual_url]
            
            if metadata.get("is_direct") and metadata.get("tweet_id"):
                cmd.extend(["-o", f"X_{metadata.get('tweet_id')}.%(ext)s"])
                
            if platform == "twitter":
                cookie_path = os.path.join(gallery_dir, "www.x.com_cookies.txt")
                if os.path.exists(cookie_path) and not metadata.get("is_direct"):
                    cmd.extend(["--cookies", cookie_path])
            
            # Si no hay un config de yt-dlp, al menos que caiga dentro de gallery-dl/twitter o facebook
            cmd.extend(["-P", os.path.join(gallery_dir, platform.capitalize())])
            
        log_info(f"Executing: {' '.join(cmd)}")
        
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
        
        stdout, stderr = process.communicate()
        
        log_info(f"Return code: {process.returncode}")
        if stdout: log_info(f"STDOUT: {stdout}")
        if stderr: log_info(f"STDERR: {stderr}")
        
        output_lower = (stdout + stderr).lower()
        if process.returncode == 0:
            if is_skipped(stdout + stderr):
                log_info("STATUS: SKIPPED")
                return {"status": "skipped", "message": "Already downloaded", "log": stdout}
            
            log_info("STATUS: SUCCESS")
            return {"status": "success", "message": "Downloaded successfully", "log": stdout}
        else:
            log_info("STATUS: ERROR")
            return {"status": "error", "message": "Download failed", "log": stderr}
            
    except Exception as e:
        log_info(f"Exception: {str(e)}")
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
    while True:
        try:
            msg = get_message()
            if "url" in msg:
                mediaType = msg.get("mediaType", "auto")
                result = download_media(msg, msg.get("platform", "auto"), msg.get("account", "M"), mediaType)
                send_message(result)
            else:
                send_message({"status": "error", "message": "No URL provided"})
        except Exception as e:
            send_message({"status": "error", "message": str(e)})

if __name__ == '__main__':
    main()
