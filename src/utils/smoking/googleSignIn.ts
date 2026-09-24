/** Google Identity Services, loaded only on the smoking page. */
interface GoogleId {
  initialize(config: { client_id: string; callback: (response: { credential: string }) => void; auto_select?: boolean }): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let loading: Promise<void> | null = null;

export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error("Google sign-in could not load. Check your connection."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function renderGoogleButton(el: HTMLElement, clientId: string, onCredential: (idToken: string) => void): void {
  const id = window.google!.accounts.id;
  id.initialize({ client_id: clientId, callback: (response) => onCredential(response.credential), auto_select: true });
  id.renderButton(el, { theme: "filled_blue", size: "large", shape: "pill", text: "continue_with", width: 300 });
}
