// The tray's "Perfil do usuário…" window loads the same bundle with
// ?view=profile (see main.go).
export function isProfileView(search: string): boolean {
  return new URLSearchParams(search).get("view") === "profile";
}

// The window has no OS chrome to inherit a theme from, so mirror the OS
// light/dark preference onto the `dark` class ourselves and keep it in sync.
export function syncColorScheme(query: MediaQueryList, root: HTMLElement): () => void {
  const apply = () => root.classList.toggle("dark", query.matches);
  apply();
  query.addEventListener("change", apply);
  return () => query.removeEventListener("change", apply);
}
