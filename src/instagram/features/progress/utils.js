export function syncModalScrollLock(openDialog) {
    if (openDialog || document.body.style.overflow === 'hidden' || document.body.style.overflow === 'clip') {
        if (document.documentElement.style.overflow !== 'hidden') {
            document.documentElement.style.overflow = 'hidden';
        }
    } else {
        if (document.documentElement.style.overflow === 'hidden') {
            document.documentElement.style.overflow = '';
        }
    }
}

