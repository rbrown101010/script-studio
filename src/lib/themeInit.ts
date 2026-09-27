// Imported by the root layout (a server component), so it must not be a client module.
/** Runs in <head> before anything renders, so there's no flash of the wrong theme. */
export const themeInit = `(function(){try{var c=localStorage.getItem("theme")||"system";var d=c==="dark"||(c==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
