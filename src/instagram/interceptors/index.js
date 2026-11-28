import './shared/logger.js';
// Must stay first after the logger: it opens the settings channel and handshake.
import './ghost/ghost_settings.js';
// Before anything that parses Instagram payloads: installs the JSON.parse replay of the local seen.
import './ghost/native_seen.js';
import './media/device_spoof.js';
import './ghost/ghost_mode.js';
import './media/fiber_search.js';
import './media/media_parser.js';
import './network/network.js';
