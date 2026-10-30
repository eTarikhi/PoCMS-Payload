import React from 'react'

import { POCMS_THEME_STORAGE_KEY } from './constants'

/**
 * Tiny synchronous pre-hydration `<head>` script that restores a visitor's
 * persisted Light/Dark theme before first paint (eliminating FOUC on reload)
 * while preserving `'dark'` as the default whenever unset.
 */
export function ThemeInitScript() {
  const initCode = `(function(){try{var t=localStorage.getItem('${POCMS_THEME_STORAGE_KEY}');var m=t==='light'?'light':'dark';var d=document.documentElement;d.dataset.theme=m;d.style.colorScheme=m;}catch(e){}})();`
  return <script dangerouslySetInnerHTML={{ __html: initCode }} />
}
