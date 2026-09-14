import os

def replace_in_file(path, old, new):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def add_import(path, import_stmt):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    if import_stmt not in content:
        content = import_stmt + '\n' + content
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

logger_path = 'src/instagram/interceptors/core/logger.js'
replace_in_file(logger_path, 'function mdLog(', 'export function mdLog(')

fiber_path = 'src/instagram/interceptors/core/fiber_search.js'
funcs = ['showGhostToast', 'isPresenceRequest', 'isSeenRequest', 'extractSignatureFromUrl', 'findStoryMedia', 'processAndPostData']
for func in funcs:
    replace_in_file(fiber_path, f'function {func}(', f'export function {func}(')
add_import(fiber_path, "import { mdLog } from './logger.js';")

ghost_path = 'src/instagram/interceptors/core/ghost_mode.js'
add_import(ghost_path, "import { mdLog } from './logger.js';")

network_path = 'src/instagram/interceptors/core/network.js'
add_import(network_path, "import { showGhostToast, isPresenceRequest, isSeenRequest, extractSignatureFromUrl, processAndPostData } from './fiber_search.js';")
add_import(network_path, "import { mdLog } from './logger.js';")
