// Composants communs de l'OS : icônes Lucide intégrées, fabrique d'éléments, boîtes de dialogue, toasts.

// Icônes Lucide (licence ISC, https://lucide.dev), tracés intégrés au code.
export const ICONES = {
  "log-in": '<path d="m10 17 5-5-5-5"/> <path d="M15 12H3"/> <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
  "star": '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  "house": '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/> <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  "layout-dashboard": '<rect width="7" height="9" x="3" y="3" rx="1"/> <rect width="7" height="5" x="14" y="3" rx="1"/> <rect width="7" height="9" x="14" y="12" rx="1"/> <rect width="7" height="5" x="3" y="16" rx="1"/>',
  "square-kanban": '<rect width="18" height="18" x="3" y="3" rx="2"/> <path d="M8 7v7"/> <path d="M12 7v4"/> <path d="M16 7v9"/>',
  "list": '<path d="M3 5h.01"/> <path d="M3 12h.01"/> <path d="M3 19h.01"/> <path d="M8 5h13"/> <path d="M8 12h13"/> <path d="M8 19h13"/>',
  "settings": '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/> <circle cx="12" cy="12" r="3"/>',
  "sun": '<circle cx="12" cy="12" r="4"/> <path d="M12 2v2"/> <path d="M12 20v2"/> <path d="m4.93 4.93 1.41 1.41"/> <path d="m17.66 17.66 1.41 1.41"/> <path d="M2 12h2"/> <path d="M20 12h2"/> <path d="m6.34 17.66-1.41 1.41"/> <path d="m19.07 4.93-1.41 1.41"/>',
  "moon": '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
  "log-out": '<path d="m16 17 5-5-5-5"/> <path d="M21 12H9"/> <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
  "panel-left-open": '<rect width="18" height="18" x="3" y="3" rx="2"/> <path d="M9 3v18"/> <path d="m14 9 3 3-3 3"/>',
  "panel-left-close": '<rect width="18" height="18" x="3" y="3" rx="2"/> <path d="M9 3v18"/> <path d="m16 15-3-3 3-3"/>',
  "menu": '<path d="M4 5h16"/> <path d="M4 12h16"/> <path d="M4 19h16"/>',
  "x": '<path d="M18 6 6 18"/> <path d="m6 6 12 12"/>',
  "plus": '<path d="M5 12h14"/> <path d="M12 5v14"/>',
  "search": '<path d="m21 21-4.34-4.34"/> <circle cx="11" cy="11" r="8"/>',
  "funnel": '<path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/>',
  "download": '<path d="M12 15V3"/> <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/> <path d="m7 10 5 5 5-5"/>',
  "mail": '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/> <rect x="2" y="4" width="20" height="16" rx="2"/>',
  "mail-check": '<path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/> <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/> <path d="m16 19 2 2 4-4"/>',
  "phone": '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
  "globe": '<circle cx="12" cy="12" r="10"/> <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/> <path d="M2 12h20"/>',
  "calendar": '<path d="M8 2v3"/> <path d="M16 2v3"/> <rect x="3" y="3" width="18" height="18" rx="2"/> <path d="M3 9h18"/>',
  "calendar-check": '<path d="M8 2v3"/> <path d="M16 2v3"/> <rect x="3" y="3" width="18" height="18" rx="2"/> <path d="M3 9h18"/> <path d="m9 15 2 2 4-4"/>',
  "check": '<path d="M20 6 9 17l-5-5"/>',
  "check-check": '<path d="M18 6 7 17l-5-5"/> <path d="m22 10-7.5 7.5L13 16"/>',
  "trash-2": '<path d="M10 11v6"/> <path d="M14 11v6"/> <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/> <path d="M3 6h18"/> <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  "copy": '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/> <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  "file-text": '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/> <path d="M14 2v5a1 1 0 0 0 1 1h5"/> <path d="M10 9H8"/> <path d="M16 13H8"/> <path d="M16 17H8"/>',
  "link": '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/> <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "arrow-up-down": '<path d="m21 16-4 4-4-4"/> <path d="M17 20V4"/> <path d="m3 8 4-4 4 4"/> <path d="M7 4v16"/>',
  "arrow-up": '<path d="m5 12 7-7 7 7"/> <path d="M12 19V5"/>',
  "arrow-down": '<path d="M12 5v14"/> <path d="m19 12-7 7-7-7"/>',
  "flame": '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
  "clock": '<circle cx="12" cy="12" r="10"/> <path d="M12 6v6l4 2"/>',
  "triangle-alert": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/> <path d="M12 9v4"/> <path d="M12 17h.01"/>',
  "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/> <path d="M16 3.128a4 4 0 0 1 0 7.744"/> <path d="M22 21v-2a4 4 0 0 0-3-3.87"/> <circle cx="9" cy="7" r="4"/>',
  "user": '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/> <circle cx="12" cy="7" r="4"/>',
  "sparkles": '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/> <path d="M20 2v4"/> <path d="M22 4h-4"/> <circle cx="4" cy="20" r="2"/>',
  "target": '<circle cx="12" cy="12" r="10"/> <circle cx="12" cy="12" r="6"/> <circle cx="12" cy="12" r="2"/>',
  "pencil": '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/> <path d="m15 5 4 4"/>',
  "archive": '<rect width="20" height="5" x="2" y="3" rx="1"/> <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/> <path d="M10 12h4"/>',
  "archive-restore": '<rect width="20" height="5" x="2" y="3" rx="1"/> <path d="M4 8v11a2 2 0 0 0 2 2h2"/> <path d="M20 8v11a2 2 0 0 1-2 2h-2"/> <path d="m9 15 3-3 3 3"/> <path d="M12 12v9"/>',
  "rotate-ccw": '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/> <path d="M3 3v5h5"/>',
  "bookmark": '<path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/>',
  "bookmark-plus": '<path d="M12 7v6"/> <path d="M15 10H9"/> <path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/>',
  "arrow-right-left": '<path d="m16 3 4 4-4 4"/> <path d="M20 7H4"/> <path d="m8 21-4-4 4-4"/> <path d="M4 17h16"/>',
  "ellipsis": '<circle cx="12" cy="12" r="1"/> <circle cx="19" cy="12" r="1"/> <circle cx="5" cy="12" r="1"/>',
  "history": '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/> <path d="M3 3v5h5"/> <path d="M12 7v5l4 2"/>',
  "sticky-note": '<path d="M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/> <path d="M15 3v5a1 1 0 0 0 1 1h5"/>',
  "briefcase": '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/> <rect width="20" height="14" x="2" y="6" rx="2"/>',
  "refresh-cw": '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/> <path d="M21 3v5h-5"/> <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/> <path d="M8 16H3v5"/>',
  "wifi-off": '<path d="M12 20h.01"/> <path d="M8.5 16.429a5 5 0 0 1 7 0"/> <path d="M5 12.859a10 10 0 0 1 5.17-2.69"/> <path d="M19 12.859a10 10 0 0 0-2.007-1.523"/> <path d="M2 8.82a15 15 0 0 1 4.177-2.643"/> <path d="M22 8.82a15 15 0 0 0-11.288-3.764"/> <path d="m2 2 20 20"/>',
  "trophy": '<path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2"/> <path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2"/> <path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"/> <path d="M4 22h16"/> <path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/> <path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"/>',
  "euro": '<path d="M4 10h12"/> <path d="M4 14h9"/> <path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2"/>',
  "chart-column": '<path d="M3 3v16a2 2 0 0 0 2 2h16"/> <path d="M18 17V9"/> <path d="M13 17V5"/> <path d="M8 17v-3"/>',
  "shield-check": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/> <path d="m9 12 2 2 4-4"/>',
  "external-link": '<path d="M15 3h6v6"/> <path d="M10 14 21 3"/> <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  "circle-check": '<circle cx="12" cy="12" r="10"/> <path d="m16 9-5.5 5.5L8 12"/>',
  "undo-2": '<path d="M9 14 4 9l5-5"/> <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  "minus": '<path d="M5 12h14"/>',
  "building-2": '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/> <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/> <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/> <path d="M10 6h4"/> <path d="M10 10h4"/> <path d="M10 14h4"/> <path d="M10 18h4"/>',
  "tag": '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/> <circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  "map-pin": '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/> <circle cx="12" cy="10" r="3"/>',
  "user-plus": '<path d="M2 21a8 8 0 0 1 10.434-7.62"/> <circle cx="10" cy="8" r="5"/> <path d="M19 16v6"/> <path d="M22 19h-6"/>',
  "chevron-up": '<path d="m18 15-6-6-6 6"/>',
  "columns-3": '<rect width="18" height="18" x="3" y="3" rx="2"/> <path d="M9 3v18"/> <path d="M15 3v18"/>',
  "handshake": '<path d="m11 17 2 2a1 1 0 1 0 3-3"/> <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/> <path d="m21 3 1 11h-2"/> <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/> <path d="M3 4h8"/>',
  "circle": '<circle cx="12" cy="12" r="10"/>',
  "info": '<circle cx="12" cy="12" r="10"/> <path d="M12 16v-4"/> <path d="M12 8h.01"/>',
  "folder-plus": '<path d="M12 10v6"/> <path d="M9 13h6"/> <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  "folder-kanban": '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/> <path d="M8 10v4"/> <path d="M12 10v2"/> <path d="M16 10v6"/>',
  "activity": '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  "upload": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/> <polyline points="17 8 12 3 7 8"/> <line x1="12" x2="12" y1="3" y2="15"/>',
  "git-branch": '<line x1="6" x2="6" y1="3" y2="15"/> <circle cx="18" cy="6" r="3"/> <circle cx="6" cy="18" r="3"/> <path d="M18 9a9 9 0 0 1-9 9"/>',
};
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Icône Lucide en SVG (élément DOM). */
export function icone(nom, { taille = 18, classe = '' } = {}) {
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg xmlns="${SVG_NS}" width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="icone ${classe}">${ICONES[nom] || ''}</svg>`;
  return tpl.content.firstElementChild;
}

/**
 * Fabrique d'éléments : h('button', { class: 'bouton', onclick }, 'Texte', enfant...).
 * Les chaînes deviennent des nœuds texte (jamais d'HTML injecté).
 */
export function h(tag, attrs = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [cle, valeur] of Object.entries(attrs || {})) {
    if (valeur === null || valeur === undefined || valeur === false) continue;
    if (cle.startsWith('on') && typeof valeur === 'function') {
      el.addEventListener(cle.slice(2).toLowerCase(), valeur);
    } else if (cle === 'class') {
      el.className = valeur;
    } else if (cle === 'style' && typeof valeur === 'object') {
      for (const [prop, v] of Object.entries(valeur)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, v);
        else el.style[prop] = v;
      }
    } else if (cle === 'value') {
      el.value = valeur;
    } else if (cle === 'dataset') {
      Object.assign(el.dataset, valeur);
    } else if (cle in el && typeof valeur !== 'string' && cle !== 'list') {
      el[cle] = valeur;
    } else if (valeur === true) {
      el.setAttribute(cle, '');
    } else {
      el.setAttribute(cle, valeur);
    }
  }
  ajouter(el, enfants);
  return el;
}

function ajouter(el, enfants) {
  for (const e of enfants.flat(Infinity)) {
    if (e === null || e === undefined || e === false) continue;
    el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
}

/** Vide un élément puis y ajoute des enfants (les valeurs nulles sont ignorées). */
export function remplir(el, ...enfants) {
  vider(el);
  ajouter(el, enfants);
  return el;
}

export function vider(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

// ---------------------------------------------------------------- toasts

/** lien : { libelle, href } ajoute un lien cliquable dans le message (ex. "Ouvrir la fiche"). */
export function toast(message, { type = 'info', duree = 3200, lien = null, action = null } = {}) {
  let zone = document.getElementById('toasts');
  if (!zone) {
    zone = h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(zone);
  }
  const t = h('div', { class: `toast toast-${type}${lien ? ' avec-lien' : ''}` }, icone(type === 'erreur' ? 'triangle-alert' : 'circle-check', { taille: 16 }), h('span', {}, message),
    lien ? h('a', { class: 'toast-lien', href: lien.href }, lien.libelle) : null,
    // Action (ex. « Annuler » après un retrait) : un bouton dans le message, qui le ferme.
    action ? h('button', { type: 'button', class: 'toast-action', dataset: { action: 'toast-action' }, onclick: () => { fermer(); action.surClic(); } }, action.libelle) : null);
  zone.append(t);
  let ferme = false;
  function fermer() {
    if (ferme) return;
    ferme = true;
    t.classList.add('sortie');
    setTimeout(() => t.remove(), 250);
  }
  setTimeout(fermer, duree);
}

// ---------------------------------------------------------------- boîtes de dialogue

/**
 * Boîte de dialogue modale.
 * boutons : [{ libelle, valeur, style: 'principal' | 'danger' | 'discret', desactive, avantFermeture }]
 * Renvoie une promesse résolue avec la valeur du bouton (null si fermée).
 */
export function dialogue({ titre, contenu, boutons = [{ libelle: 'OK', valeur: true, style: 'principal' }], classe = '', auMontage } = {}) {
  return new Promise((resoudre) => {
    const precedent = document.activeElement;
    const voile = h('div', { class: 'voile-dialogue' });
    const idTitre = `dlg-${Math.random().toString(36).slice(2, 8)}`;
    const pied = h('div', { class: 'dialogue-pied' });
    const boite = h('div', { class: `dialogue ${classe}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': idTitre },
      h('div', { class: 'dialogue-tete' },
        h('h2', { id: idTitre }, titre || ''),
        h('button', { class: 'bouton-icone', type: 'button', 'aria-label': 'Fermer', onclick: () => fermer(null) }, icone('x'))),
      h('div', { class: 'dialogue-corps' }, contenu || ''),
      pied);
    const elementsBoutons = boutons.map((b) => {
      const btn = h('button', {
        type: 'button',
        class: `bouton ${b.style === 'principal' ? 'bouton-principal' : b.style === 'danger' ? 'bouton-danger' : 'bouton-secondaire'}`,
        disabled: !!b.desactive,
        dataset: { valeur: String(b.valeur) },
        onclick: async () => {
          if (b.avantFermeture) {
            const ok = await b.avantFermeture();
            if (ok === false) return;
          }
          fermer(typeof b.valeur === 'function' ? b.valeur() : b.valeur);
        },
      }, b.libelle);
      pied.append(btn);
      return btn;
    });
    voile.append(boite);
    document.body.append(voile);
    // Échap ferme la fenêtre du dessus, où que soit le focus (un champ intelligent qui ferme sa liste garde l'événement).
    function surTouche(e) {
      if (e.key !== 'Escape' || voile !== [...document.querySelectorAll('.voile-dialogue')].at(-1)) return;
      e.stopPropagation();
      fermer(null);
    }
    document.addEventListener('keydown', surTouche);
    voile.addEventListener('mousedown', (e) => { if (e.target === voile) fermer(null); });
    let ferme = false;
    function fermer(valeur) {
      if (ferme) return;
      ferme = true;
      document.removeEventListener('keydown', surTouche);
      voile.remove();
      if (precedent && precedent.isConnected) precedent.focus?.();
      resoudre(valeur);
    }
    auMontage?.({ boite, boutons: elementsBoutons, fermer });
    requestAnimationFrame(() => {
      const cible = boite.querySelector('[autofocus], input, select, textarea') || elementsBoutons.at(-1);
      // Si l'utilisateur est déjà dans un champ de la fenêtre (il a commencé à taper), on ne lui reprend pas le focus.
      if (!boite.contains(document.activeElement)) cible?.focus();
    });
  });
}

export async function confirmer(titre, message, { libelleOk = 'Confirmer', danger = false } = {}) {
  const r = await dialogue({
    titre,
    contenu: h('p', {}, message),
    boutons: [
      { libelle: 'Annuler', valeur: false },
      { libelle: libelleOk, valeur: true, style: danger ? 'danger' : 'principal' },
    ],
  });
  return r === true;
}

/** Demande un texte (ex. nom d'un filtre). Renvoie la chaîne ou null. */
export async function demanderTexte(titre, { libelle = '', valeur = '', libelleOk = 'Enregistrer' } = {}) {
  const champ = h('input', { type: 'text', class: 'champ', value: valeur, 'aria-label': libelle || titre, autofocus: true });
  const r = await dialogue({
    titre,
    contenu: h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, libelle), champ),
    boutons: [
      { libelle: 'Annuler', valeur: null },
      { libelle: libelleOk, valeur: () => champ.value.trim(), style: 'principal' },
    ],
    auMontage: ({ boutons }) => {
      champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') boutons.at(-1).click(); });
    },
  });
  return r ? r : null;
}

// ---------------------------------------------------------------- stockage local (préférences de l'appareil)

export function lirePreference(cle, defaut = null) {
  try { return localStorage.getItem(`chevalier-os.${cle}`) ?? defaut; } catch { return defaut; }
}
export function ecrirePreference(cle, valeur) {
  try { localStorage.setItem(`chevalier-os.${cle}`, valeur); } catch { /* stockage indisponible */ }
}

export function reduireAnimations() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function estTelephone() {
  return window.matchMedia('(max-width: 767px)').matches;
}

// ---------------------------------------------------------------- menu contextuel ("⋯")

/**
 * Petit menu flottant sous un élément (ou au-dessus avec `{ placement: 'haut' }`, pour un bouton placé en bas de l'écran).
 * items : [{ libelle, icone, action, danger, desactive }] ; autres éléments possibles :
 *  - { texte } : ligne d'information, non cliquable (ex. l'adresse e-mail) ;
 *  - { separateur: true } : fine ligne de séparation ;
 *  - { noeud } : bouton déjà fabriqué (ex. la bascule de thème) ; le menu reste ouvert quand on l'utilise.
 * Se ferme au clic extérieur (souris ou toucher), à Échap et au choix d'une entrée ; le focus revient alors à `ancre`.
 * Clavier : flèches et Tab passent d'une entrée à l'autre, Entrée choisit. Renvoie la fonction de fermeture.
 */
export function ouvrirMenu(ancre, items, { placement = 'bas' } = {}) {
  document.querySelector('.menu-pop')?.remove();
  const menu = h('div', { class: 'menu-pop', role: 'menu', dataset: { placement } });
  const fermer = () => {
    menu.remove();
    document.removeEventListener('pointerdown', surClicExterieur, true);
    document.removeEventListener('keydown', surTouche, true);
    ancre.setAttribute?.('aria-expanded', 'false');
    ancre.focus?.();
  };
  function surClicExterieur(e) { if (!menu.contains(e.target) && !ancre.contains(e.target)) fermer(); }
  function surTouche(e) {
    if (e.key === 'Escape') { e.stopPropagation(); fermer(); }
    const avance = e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey);
    if (avance || e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      const liste = [...menu.querySelectorAll('button:not(:disabled)')];
      const i = liste.indexOf(document.activeElement);
      liste[(i + (avance ? 1 : -1) + liste.length) % liste.length]?.focus();
    }
  }
  for (const it of items) {
    if (it.separateur) { menu.append(h('div', { class: 'menu-pop-separateur', role: 'separator' })); continue; }
    if (it.texte !== undefined) { menu.append(h('div', { class: 'menu-pop-texte' }, it.texte)); continue; }
    if (it.noeud) { it.noeud.setAttribute('role', 'menuitem'); menu.append(it.noeud); continue; }
    menu.append(h('button', {
      type: 'button', role: 'menuitem', class: `menu-pop-entree${it.danger ? ' danger' : ''}`, disabled: !!it.desactive,
      onclick: () => { fermer(); it.action?.(); },
    }, it.icone ? icone(it.icone, { taille: 16 }) : null, it.libelle));
  }
  document.body.append(menu);
  const r = ancre.getBoundingClientRect();
  const l = menu.offsetWidth;
  if (placement === 'haut') {
    menu.style.top = `${Math.max(8, r.top - menu.offsetHeight - 6)}px`;
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - l - 8))}px`;
  } else {
    menu.style.top = `${Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 8)}px`;
    menu.style.left = `${Math.max(8, Math.min(r.right - l, window.innerWidth - l - 8))}px`;
  }
  ancre.setAttribute?.('aria-expanded', 'true');
  document.addEventListener('pointerdown', surClicExterieur, true);
  document.addEventListener('keydown', surTouche, true);
  menu.querySelector('button:not(:disabled)')?.focus();
  return fermer;
}

// ---------------------------------------------------------------- champ de saisie intelligent

/**
 * Champ intelligent : on tape, il propose les valeurs existantes (voir logique.js : rechercherSuggestions).
 * options :
 *  - fournir(saisie) : { resultats: [{ id, libelle, sousTitre?, segments }], creer?: texte } ou
 *                      { groupes: [{ titre, resultats }], creer?: texte }
 *  - surChoix(element) : appelé quand on choisit un résultat (null quand le choix est effacé)
 *  - surCreation(texte) : (async) crée la valeur et renvoie un élément { id, libelle } (ou null)
 *  - multiple : plusieurs valeurs, affichées en pastilles ; valeur : élément initial (ou liste si multiple)
 *  - libre : le texte tapé est la valeur (ville) ; texteInitial
 * Clavier : flèches, Entrée sur la ligne active, Échap ; la souris et le toucher choisissent directement.
 */
export function champIntelligent({
  etiquette = '', placeholder = '', icone: nomIcone = null, multiple = false, fournir, surChoix = () => {},
  surCreation = null, valeur = null, texteInitial = '', libre = false, surSaisie = () => {}, autofocus = false, id = null,
  classe = '', ariaDescription = null,
} = {}) {
  const idListe = `sug-${Math.random().toString(36).slice(2, 8)}`;
  let choix = multiple ? [...(valeur || [])] : (valeur || null);
  let actif = -1;
  let options = []; // éléments <li role=option> actuels
  let donnees = []; // résultats correspondants (ou { creer })

  const entree = h('input', {
    type: 'text', class: 'champ champ-intelligent-saisie', role: 'combobox', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    'aria-label': etiquette || placeholder, 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': idListe,
    'aria-describedby': ariaDescription, placeholder, id, autofocus: autofocus || null,
  });
  const liste = h('ul', { class: 'suggestions', id: idListe, role: 'listbox', 'aria-label': `Suggestions : ${etiquette || placeholder || 'liste'}`, hidden: true });
  const pastilles = h('span', { class: 'champ-intelligent-pastilles' });
  const effacer = h('button', { type: 'button', class: 'champ-intelligent-effacer', 'aria-label': 'Effacer', hidden: true, tabindex: '-1',
    onclick: () => { definir(null); entree.focus(); } }, icone('x', { taille: 14 }));
  const racine = h('div', { class: `champ-intelligent${multiple ? ' multiple' : ''} ${classe}` },
    nomIcone ? icone(nomIcone, { taille: 16, classe: 'champ-intelligent-icone' }) : null,
    multiple ? h('div', { class: 'champ-intelligent-zone champ' }, pastilles, entree) : entree,
    multiple ? null : effacer, liste);

  function rendrePastilles() {
    entree.placeholder = choix.length ? '' : placeholder;
    remplir(pastilles, ...choix.map((el) => h('span', { class: 'pastille-choix', style: el.couleur ? { '--couleur': el.couleur } : null },
      el.libelle,
      h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': `Retirer ${el.libelle}`, tabindex: '-1',
        onclick: (e) => { e.stopPropagation(); choix = choix.filter((x) => x.id !== el.id); rendrePastilles(); surChoix(choix); } }, icone('x', { taille: 12 })))));
  }
  function synchroniser() {
    if (multiple) rendrePastilles();
    else {
      entree.value = choix ? choix.libelle : (libre ? entree.value : '');
      effacer.hidden = !choix;
      racine.classList.toggle('a-un-choix', !!choix);
    }
  }
  function fermerListe() {
    liste.hidden = true;
    entree.setAttribute('aria-expanded', 'false');
    entree.removeAttribute('aria-activedescendant');
    actif = -1;
  }
  function activer(i) {
    actif = i;
    options.forEach((o, k) => { o.classList.toggle('actif', k === i); o.setAttribute('aria-selected', String(k === i)); });
    if (i >= 0 && options[i]) { entree.setAttribute('aria-activedescendant', options[i].id); options[i].scrollIntoView?.({ block: 'nearest' }); }
    else entree.removeAttribute('aria-activedescendant');
  }
  function ligne(el, k) {
    const lib = el.segments ? el.segments.map((s) => (s.fort ? h('strong', {}, s.texte) : s.texte)) : el.libelle;
    return h('li', { class: 'suggestion', role: 'option', id: `${idListe}-${k}`, 'aria-selected': 'false',
      onmousedown: (e) => e.preventDefault(), onclick: () => choisir(k) },
      el.couleur ? h('span', { class: 'puce-couleur', style: { background: el.couleur } }) : null,
      h('span', { class: 'suggestion-texte' }, h('span', { class: 'suggestion-libelle' }, lib), el.sousTitre ? h('span', { class: 'suggestion-sous' }, el.sousTitre) : null));
  }
  function ouvrir() {
    const saisie = entree.value;
    const r = fournir(saisie) || {};
    const groupes = r.groupes || [{ titre: null, resultats: r.resultats || [] }];
    remplir(liste);
    options = [];
    donnees = [];
    for (const g of groupes) {
      if (!g.resultats.length) continue;
      if (g.titre) liste.append(h('li', { class: 'suggestion-groupe', role: 'presentation' }, g.titre));
      for (const el of g.resultats) {
        const k = donnees.length;
        donnees.push(el);
        const li = ligne(el, k);
        options.push(li);
        liste.append(li);
      }
    }
    if (r.creer && surCreation) {
      const k = donnees.length;
      donnees.push({ creer: r.creer });
      const li = h('li', { class: 'suggestion suggestion-creer', role: 'option', id: `${idListe}-${k}`, 'aria-selected': 'false',
        onmousedown: (e) => e.preventDefault(), onclick: () => choisir(k) },
      icone('plus', { taille: 14 }), h('span', { class: 'suggestion-texte' }, `Créer « ${r.creer} »`));
      options.push(li);
      liste.append(li);
    }
    const aucun = !options.length;
    liste.hidden = aucun;
    entree.setAttribute('aria-expanded', String(!aucun));
    actif = -1;
    entree.removeAttribute('aria-activedescendant');
  }
  async function choisir(k) {
    const d = donnees[k];
    if (!d) return;
    let el = d;
    if (d.creer !== undefined) {
      el = await surCreation(d.creer);
      if (!el) return;
    }
    if (multiple) {
      if (!choix.some((x) => x.id === el.id)) choix = [...choix, el];
      entree.value = '';
      rendrePastilles();
      fermerListe();
      surChoix(choix);
      entree.focus();
    } else {
      choix = el;
      synchroniser();
      fermerListe();
      surChoix(el);
    }
  }
  function definir(el) {
    choix = multiple ? (el || []) : el;
    if (!multiple && !el) entree.value = '';
    synchroniser();
    surChoix(choix);
  }

  entree.addEventListener('focus', () => clearTimeout(minuteurBlur));
  entree.addEventListener('input', () => {
    clearTimeout(minuteurBlur);
    if (!multiple && choix && entree.value !== choix.libelle) { choix = null; effacer.hidden = true; racine.classList.remove('a-un-choix'); surChoix(null); }
    surSaisie(entree.value);
    ouvrir();
  });
  entree.addEventListener('focus', () => { if (entree.value && !choix && !multiple) ouvrir(); });
  entree.addEventListener('keydown', (e) => {
    const ouverte = !liste.hidden;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!ouverte) ouvrir();
      if (!options.length) return;
      e.preventDefault();
      activer((actif + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (e.key === 'Enter' && ouverte && actif >= 0) {
      e.preventDefault();
      choisir(actif);
    } else if (e.key === 'Escape' && ouverte) {
      e.stopPropagation();
      fermerListe();
    } else if (e.key === 'Backspace' && multiple && !entree.value && choix.length) {
      choix = choix.slice(0, -1);
      rendrePastilles();
      surChoix(choix);
    }
  });
  // La liste se ferme un instant après la perte du focus (le clic sur une suggestion a le temps d'aboutir) ;
  // si on revient dans le champ entre temps, cette fermeture différée est annulée.
  let minuteurBlur = null;
  entree.addEventListener('blur', () => { minuteurBlur = setTimeout(fermerListe, 120); });

  if (texteInitial) entree.value = texteInitial;
  synchroniser();
  return {
    element: racine,
    entree,
    /** Choix courant : élément (ou liste si multiple), null si aucun. */
    choix: () => choix,
    texte: () => entree.value.trim(),
    definir,
    effacer: () => definir(multiple ? [] : null),
    focus: () => entree.focus(),
    fermer: fermerListe,
  };
}
