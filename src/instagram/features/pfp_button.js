/* Media Downloader - PFP Button: Profile picture download button */

function injectPfpButton() {
    let overlayRoot = getOverlayRoot();
    let profilePic = document.querySelector('header img[alt*="profile picture"], header img[alt*="foto de perfil"]');
    if (profilePic && !profilePic.__md_processed) {
        profilePic.__md_processed = true;
        let id = 'md-pfp-dl';
        profilePic.dataset.mdId = id;

        // (Invisible tab logic removed as we now use the native background API)

        let dlBtn = document.createElement('button');
        dlBtn.id = id;
        dlBtn.className = 'md-pfp-btn';
        dlBtn.innerHTML = SVG_DOWNLOAD;
        dlBtn.title = "Download Profile Picture";

        // --- Rediseño Premium (Efecto Glassmorphism/Cristal) ---
        dlBtn.style.position = 'absolute';
        dlBtn.style.pointerEvents = 'auto';
        dlBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        dlBtn.style.backdropFilter = 'blur(12px)';
        dlBtn.style.WebkitBackdropFilter = 'blur(12px)';
        dlBtn.style.borderRadius = '50%';
        dlBtn.style.width = '34px';
        dlBtn.style.height = '34px';
        dlBtn.style.display = 'flex';
        dlBtn.style.alignItems = 'center';
        dlBtn.style.justifyContent = 'center';
        dlBtn.style.color = '#fff';
        dlBtn.style.border = '1px solid rgba(255, 255, 255, 0.4)';
        dlBtn.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.25)';
        dlBtn.style.cursor = 'pointer';
        dlBtn.style.padding = '0';
        dlBtn.style.outline = 'none';
        dlBtn.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';

        let svgIcon = dlBtn.querySelector('svg');
        if (svgIcon) {
            svgIcon.style.width = '18px';
            svgIcon.style.height = '18px';
            svgIcon.style.transform = 'translateY(-1.5px)';
        }

        dlBtn.onmouseenter = () => {
            dlBtn.style.background = 'rgba(255, 255, 255, 0.35)';
            dlBtn.style.transform = 'scale(1.1)';
            dlBtn.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.35)';
        };
        dlBtn.onmouseleave = () => {
            dlBtn.style.background = 'rgba(255, 255, 255, 0.2)';
            dlBtn.style.transform = 'scale(1)';
            dlBtn.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.25)';
        };

        overlayRoot.appendChild(dlBtn);

        dlBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            let username = window.location.pathname.split('/').filter(Boolean)[0];
            dlBtn.classList.add('md-loading');
            
            console.log("MD PFP: Extracting highest resolution...");
            
            let src = profilePic.src || profilePic.currentSrc;
            let hdUrl = src;
            
            let srcset = profilePic.getAttribute('srcset') || "";
            if (srcset) {
                // Extraer todas las URLs del srcset de forma segura
                let urlsInSrcset = srcset.match(/https:\/\/[^\s]+/g) || [];
                
                for (let url of urlsInSrcset) {
                    if (url.endsWith(',')) url = url.slice(0, -1);
                    
                    // Asumiendo que el srcset está ordenado, nos quedamos con el último que no sea una miniatura pequeña
                    if (!url.includes('150x150') && !url.includes('320x320')) {
                        hdUrl = url;
                    }
                }
            }
            
            // Si el srcset falló o solo llegó a 150x150, buscamos el ID único de la foto en todo el código fuente (React State / SSR)
            if (hdUrl.includes('150x150')) {
                let filename = "";
                try {
                    let urlObj = new URL(src);
                    let pathParts = urlObj.pathname.split('/');
                    filename = pathParts[pathParts.length - 1];
                } catch (e) { }

                if (filename) {
                    let idWithoutExt = filename.split('.')[0];
                    let html = document.documentElement.innerHTML;
                    
                    // Buscar cualquier URL que contenga el ID único de la foto
                    // Formato: https://...idWithoutExt...jpg o png (permitiendo \ para URLs escapadas en JSON)
                    let regex = new RegExp(`https:\\/\\/[^\\s"'<]*?${idWithoutExt}[^\\s"'<]*?(?:\\.jpg|\\.png)[^\\s"'<]*`, 'g');
                    let matches = html.match(regex) || [];
                    
                    let bestMatch = null;
                    let bestRes = 0;
                    
                    for (let m of matches) {
                        let cleanUrl = m.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
                        let resMatch = cleanUrl.match(/(\d+)x(\d+)/);
                        
                        if (resMatch) {
                            let res = parseInt(resMatch[1]);
                            if (res > bestRes && res > 150) {
                                bestRes = res;
                                bestMatch = cleanUrl;
                            }
                        } else if (!cleanUrl.includes('150x150') && !cleanUrl.includes('320x320')) {
                            // Si no tiene resolución en el string, usualmente es la original (la más alta)
                            if (bestRes < 10000) {
                                bestMatch = cleanUrl;
                                bestRes = 10000;
                            }
                        }
                    }
                    
                    if (bestMatch) {
                        hdUrl = bestMatch;
                        console.log("MD PFP: Encontrada versión HD en código fuente (Regex):", hdUrl);
                    }
                }
            }
            
            // ÚLTIMO RECURSO: Engañar a React simulando un Zoom Real (devicePixelRatio)
            if (hdUrl.includes('150x150')) {
                let zoomData = await new Promise(resolve => {
                    let originalSrc = profilePic.src;
                    
                    // Usar vanish.js (que ya corre en el MAIN world) para evadir la CSP de Instagram
                    window.postMessage({ type: 'MD_SPOOF_ZOOM' }, '*');
                    
                    let checks = 0;
                    let checkInterval = setInterval(() => {
                        checks++;
                        let currentSrc = profilePic.src || profilePic.currentSrc;
                        let currentSrcset = profilePic.getAttribute('srcset') || "";
                        
                        let foundHd = null;
                        if (currentSrc !== originalSrc && !currentSrc.includes('150x150')) {
                            foundHd = currentSrc;
                        } else if (currentSrcset.includes('1080')) {
                            let urlsInSrcset = currentSrcset.match(/https:\/\/[^\s]+/g) || [];
                            for (let u of urlsInSrcset) {
                                if (u.endsWith(',')) u = u.slice(0, -1);
                                if (!u.includes('150x150') && !u.includes('320x320')) {
                                    foundHd = u;
                                }
                            }
                        }
                        
                        if (foundHd || checks > 30) { // Max 3 segundos
                            clearInterval(checkInterval);
                            
                            // Restaurar devicePixelRatio a través de vanish.js
                            window.postMessage({ type: 'MD_RESTORE_ZOOM' }, '*');
                            
                            resolve(foundHd);
                        }
                    }, 100);
                });
                
                if (zoomData && zoomData !== "" && !zoomData.includes('150x150')) {
                    hdUrl = zoomData;
                    console.log("MD PFP: ¡Zoom exitoso! URL obtenida:", hdUrl);
                }
            }
            
            // FILTRO ESTRICTO: TODO O NADA (A menos que hayamos logrado quitar el 150x150)
            if (hdUrl.includes('150x150')) {
                console.error("MD PFP Error: Solo se encontró la versión 150x150, abortando descarga.");
                dlBtn.classList.remove('md-loading');
                dlBtn.classList.add('md-error');
                setTimeout(() => {
                    dlBtn.classList.remove('md-error');
                }, 2000);
                return;
            }

            // Descargar usando la fecha original del CDN
            chrome.runtime.sendMessage({ action: "get_cdn_timestamp", url: hdUrl }, (res) => {
                let finalTimestamp = (res && res.timestamp) ? res.timestamp : Math.floor(Date.now() / 1000);
                
                chrome.runtime.sendMessage({
                    action: "queue_download",
                    url: hdUrl,
                    direct_metadata: {
                        username: username,
                        shortcode: "profile_pic",
                        is_video: false,
                        timestamp: finalTimestamp
                    },
                    mediaType: "direct_story",
                    platform: "instagram"
                }, (response) => {
                    if (response && (response.status === "success" || response.status === "queued")) {
                        console.log("MD PFP queued to host with URL:", hdUrl);
                        dlBtn.classList.remove('md-error', 'md-loading');
                        dlBtn.classList.add('md-success');
                        dlBtn.innerHTML = SVG_CHECK;
                        setTimeout(() => {
                            dlBtn.classList.remove('md-success');
                            dlBtn.innerHTML = SVG_DOWNLOAD;
                        }, 2000);
                    } else {
                        console.error("MD PFP queue failed:", response);
                        dlBtn.classList.remove('md-loading');
                        dlBtn.classList.add('md-error');
                        setTimeout(() => {
                            dlBtn.classList.remove('md-error');
                            dlBtn.innerHTML = SVG_DOWNLOAD;
                        }, 2000);
                    }
                });
            });
        };
    }
}
