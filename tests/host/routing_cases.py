"""Input matrix for the host routing characterization test (shared by the golden generator and the test)."""

# 2023-11-15 12:00 UTC: the date part of filenames is the same in every timezone from UTC-11 to UTC+11.
TS = 1700049600
DASH = '<?xml version="1.0"?><MPD><Period><AdaptationSet/></Period></MPD>'

CASES = [
    # --- Instagram direct media (handlers/direct_media.py)
    ("ig_image_shortcode", {"url": "https://cdn.example/a/123_n.jpg", "platform": "instagram", "mediaType": "direct_story",
                            "direct_metadata": {"timestamp": TS, "shortcode": "ABCDEFGHIJK", "username": "alice"}}),
    ("ig_image_media_id_only", {"url": "https://cdn.example/a/1.jpg", "platform": "instagram", "mediaType": "direct_story",
                                "direct_metadata": {"timestamp": TS, "media_id": "3123456789_42", "username": "alice"}}),
    ("ig_carousel_index", {"url": "https://cdn.example/a/2.jpg", "platform": "instagram", "mediaType": "direct_story",
                           "direct_metadata": {"timestamp": TS, "shortcode": "ABCDEFGHIJK", "index": 3, "username": "alice"}}),
    ("ig_video_mp4", {"url": "https://cdn.example/v/clip.mp4?x=1", "platform": "instagram", "mediaType": "direct_story",
                      "direct_metadata": {"timestamp": TS, "shortcode": "VIDEOSHORT1", "username": "bob", "is_video": True}}),
    ("ig_dash", {"url": "https://cdn.example/v/clip.mp4", "platform": "instagram", "mediaType": "direct_story",
                 "direct_metadata": {"timestamp": TS, "shortcode": "DASHSHORT01", "username": "bob", "dash_manifest": DASH}}),
    ("ig_profile_pic", {"url": "https://cdn.example/p/pfp.jpg", "platform": "instagram", "mediaType": "direct_story",
                        "direct_metadata": {"timestamp": TS, "shortcode": "profile_pic", "username": "carol"}}),
    ("ig_backup_story", {"url": "https://cdn.example/s/9.jpg", "platform": "instagram", "mediaType": "direct_story",
                         "direct_metadata": {"timestamp": TS, "media_id": "999", "username": "dave", "is_backup": True, "media_category": "story"}}),
    ("ig_backup_pfp", {"url": "https://cdn.example/s/p.jpg", "platform": "instagram", "mediaType": "direct_story",
                       "direct_metadata": {"timestamp": TS, "shortcode": "profile_pic", "username": "dave", "is_backup": True, "media_category": "pfp"}}),
    ("ig_blob_with_shortcode", {"url": "blob:https://www.instagram.com/x", "platform": "instagram", "mediaType": "direct_story",
                                "direct_metadata": {"timestamp": TS, "shortcode": "BLOBSHORT01", "username": "erin"}}),
    ("ig_blob_story_id", {"url": "blob:https://www.instagram.com/y", "platform": "instagram", "mediaType": "direct_story",
                          "direct_metadata": {"timestamp": TS, "media_id": "31234567_5", "username": "erin"}}),
    ("ig_ms_timestamp", {"url": "https://cdn.example/a/3.jpg", "platform": "instagram", "mediaType": "direct_story",
                         "direct_metadata": {"timestamp": TS * 1000, "shortcode": "MSSHORTCODE", "username": "alice"}}),
    # --- Facebook direct media
    ("fb_direct_video_user_id", {"url": "https://video.fbcdn.example/v.mp4", "platform": "facebook", "mediaType": "direct_story",
                                 "direct_metadata": {"timestamp": TS, "shortcode": "987654321", "username": "frank", "is_video": True, "user_id": "100001"}}),
    ("fb_direct_image", {"url": "https://scontent.fbcdn.example/i.jpg", "platform": "facebook", "mediaType": "direct_story",
                         "direct_metadata": {"timestamp": TS, "shortcode": "pfbidABC", "username": "frank"}}),
    ("fb_blob_story_url", {"url": "blob:https://www.facebook.com/z", "platform": "facebook", "mediaType": "direct_story",
                           "direct_metadata": {"timestamp": TS, "shortcode": "777", "username": "frank", "story_url": "https://www.facebook.com/stories/1/2"}}),
    # --- Instagram page URLs (handlers/gallery_dl_handler.py)
    ("ig_gallery_account_m", {"url": "https://www.instagram.com/p/ABCDEFGHIJK/", "platform": "instagram", "account": "M", "direct_metadata": {}}),
    ("ig_gallery_account_v", {"url": "https://www.instagram.com/p/ABCDEFGHIJK/", "platform": "instagram", "account": "V", "direct_metadata": {}}),
    ("ig_gallery_backup", {"url": "https://www.instagram.com/p/BACKUPCODE1/", "platform": "instagram", "direct_metadata": {"is_backup": True, "username": "gina"}}),
    # --- Facebook / X page URLs (handlers/ytdlp_handler.py)
    ("x_direct_tweet", {"url": "https://x.com/u/status/1", "platform": "twitter", "mediaType": "photo",
                        "direct_metadata": {"is_direct": True, "url": "https://pbs.twimg.com/media/A?format=jpg&name=orig", "tweet_id": "1"}}),
    ("x_page", {"url": "https://x.com/u/status/2", "platform": "twitter", "direct_metadata": {}}),
    ("x_backup", {"url": "https://x.com/u/status/3", "platform": "twitter", "direct_metadata": {"is_backup": True, "username": "hank"}}),
    ("fb_page_video", {"url": "https://www.facebook.com/reel/123", "platform": "facebook", "mediaType": "auto",
                       "direct_metadata": {"timestamp": TS, "shortcode": "123", "username": "ivy"}}),
    ("fb_page_story_photo", {"url": "https://www.facebook.com/stories/1", "platform": "facebook", "mediaType": "photo",
                             "direct_metadata": {"timestamp": TS, "shortcode": "story", "username": "ivy"}}),
    ("fb_backup", {"url": "https://www.facebook.com/reel/456", "platform": "facebook",
                   "direct_metadata": {"timestamp": TS, "shortcode": "456", "username": "ivy", "is_backup": True}}),
]

GALLERY_CONFIG = {"extractor": {"instagram": {"filename": {
    "": "{date:%Y-%m-%d}_{shortcode[:11]}.{extension}",
    "sidecar_shortcode": "{date:%Y-%m-%d}_{sidecar_shortcode[:11]}_{num}.{extension}",
}}}}
