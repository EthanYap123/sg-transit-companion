export const THEME_KEY = 'sg-transit-theme';

/**
 * Runs in <head> before the first paint so the page never flashes the wrong theme. Light is the
 * default on every device, even one set to dark mode; "Match device" is an explicit choice.
 */
export const THEME_INIT_SCRIPT = `(function(){var t='light';try{var s=localStorage.getItem('${THEME_KEY}');if(s==='dark'||s==='system')t=s}catch(e){}document.documentElement.dataset.theme=t})()`;
